odoo.define('mail.messaging.EntityManager', function (require) {
'use strict';

const { registry } = require('mail.messaging.entityCore');
const EntityField = require('mail.messaging.EntityField');
const { patchClassMethods, patchInstanceMethods } = require('mail.messaging.utils');

/**
 * Object that manage entities, notably their update cycle: whenever some
 * entities are requested for update (either with static method `create()` or
 * instance method `update()`), this object processes them with direct field &
 * and computed field updates.
 */
class EntityManager {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    constructor(env) {
        /**
         * Contains all entity classes. key is entity name, and value
         * is class.
         */
        this.classes = {};
        /**
         * The messaging env.
         */
        this.env = env;

        /**
         * Contains all entity instances. key is local id, while value is
         * instance.
         */
        this._instances = {};
        /**
         * Whether this is currently handling an "update after" on an entity.
         * Useful to determine if we should process computed/related fields.
         */
        this._isHandlingToUpdateAfters = false;
        /**
         * Determine whether an update cycle is currently in progress.
         * Useful to determine whether an update should initiate an update
         * cycle or not. An update cycle basically prioritizes processing
         * of all direct updates (i.e. explicit from `data`) before
         * processing computes.
         */
        this._isInUpdateCycle = false;
        /**
         * Fields flagged to call compute during an update cycle.
         * For instance, when a field with dependents got update, dependent
         * fields should update themselves by invoking compute at end of
         * update cycle. Key is of format <entity-local-id>--<fieldName>, and
         * determine entity and field to be computed.
         */
        this._toComputeFields = new Map();
        /**
         * List of "update after" on entities that have been registered.
         * These are processed after any explicit update and computed/related
         * fields.
         */
        this._toUpdateAfters = [];
    }

    /**
     * Called when all JS modules that register or patch entities have been
     * done. This launches generation of entity classes.
     */
    start() {
        /**
         * Generate the entities.
         */
        this.classes = this._generateClasses();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Returns all instance entities of provided entity class that match
     * provided criteria.
     *
     * @param {mail.messaging.entity.Entity} Entity class
     * @param {function} [filterFunc]
     * @returns {mail.messaging.entity.Entity[]}
     */
    all(Entity, filterFunc) {
        const allEntities = Object.values(this._instances)
            .filter(e => e instanceof Entity);
        if (filterFunc) {
            return allEntities.filter(filterFunc);
        }
        return allEntities;
    }

    /**
     * Register an entity that has been created, and manage update of entities
     * from this entity creation.
     *
     * @param {mail.messaging.entity.Entity} Entity class
     * @param {Object} [data={}]
     * @returns {mail.messaging.entity.Entity}
     */
    create(Entity, data = {}) {
        const entity = new Entity({ valid: true });
        Object.defineProperty(entity, 'env', { get: () => entity.constructor.env });
        entity.localId = entity._createInstanceLocalId(data);

        // Make state, which contain field values of entity that have to
        // be observed in store.
        this.env.store.state[entity.localId] = {};
        entity.__state = this.env.store.state[entity.localId];

        // Make proxified entity, so that access to field redirects
        // to field getter.
        const proxifiedEntity = this._makeProxifiedEntity(entity);
        this._instances[entity.localId] = proxifiedEntity;
        proxifiedEntity.init();
        this._makeDefaults(proxifiedEntity);

        const data2 = Object.assign({}, data);
        for (const field of Object.values(Entity.fields)) {
            if (field.fieldType !== 'relation') {
                continue;
            }
            if (!field.autocreate) {
                continue;
            }
            data2[field.fieldName] = [['create']];
        }

        for (const field of Object.values(Entity.fields)) {
            if (field.compute || field.related) {
                // new entity should always invoke computed fields.
                this.registerToComputeField(entity, field);
            }
        }

        this.update(proxifiedEntity, data2);

        return proxifiedEntity;
    }

    /**
     * Delete the entity. After this operation, it's as if this entity never
     * existed. Note that relation are removed, which may delete more relations
     * if some of them are causal.
     *
     * @param {mail.messaging.entity.Entity} entity
     */
    delete(entity) {
        if (!this.get(entity.constructor, entity)) {
            // Entity has already been deleted.
            // (e.g. unlinking one of its reverse relation was causal)
            return;
        }
        const data = {};
        const entityRelations = Object.values(entity.constructor.fields)
            .filter(field => field.fieldType === 'relation');
        for (const relation of entityRelations) {
            if (relation.isCausal) {
                switch (relation.relationType) {
                    case 'one2one':
                    case 'many2one':
                        if (entity[relation.fieldName]) {
                            entity[relation.fieldName].delete();
                        }
                        break;
                    case 'one2many':
                    case 'many2many':
                        for (const relatedEntity of entity[relation.fieldName]) {
                            relatedEntity.delete();
                        }
                        break;
                }
            }
            data[relation.fieldName] = [['unlink-all']];
        }
        entity.update(data);
        delete this._instances[entity.localId];
        delete this.env.store.state[entity.localId];
    }

    /**
     * Delete all entity instances.
     */
    deleteAll() {
        for (const entity of Object.values(this._instances)) {
            entity.delete();
        }
    }

    /**
     * Get the instance entity of provided entity class that has provided
     * criteria, if it exists.
     *
     * @param {mail.messaging.entity.Entity} Entity class
     * @param {function} findFunc
     * @returns {mail.messaging.entity.Entity|undefined}
     */
    find(Entity, findFunc) {
        return this.all(Entity).find(findFunc);
    }

    /**
     * This method returns the entity of provided entity class that matches
     * provided local id. Useful to convert a local id to an entity. Note that
     * even if there's a entity in the system having provided local id, if the
     * resulting entity is not an instance of this class, this getter
     * assumes the entity does not exist.
     *
     * @param {mail.messaging.entity.Entity} Entity class
     * @param {string|mail.messaging.entity.Entity|undefined} entityOrLocalId
     * @returns {mail.messaging.entity.Entity|undefined}
     */
    get(Entity, entityOrLocalId) {
        if (entityOrLocalId === undefined) {
            return undefined;
        }
        const entity = this._instances[
            entityOrLocalId instanceof this.classes.Entity
                ? entityOrLocalId.localId
                : entityOrLocalId
        ];
        if (!(entity instanceof Entity)) {
            return;
        }
        return entity;
    }

    /**
     * This method creates an instance entity or updates one of provided
     * entity class, based on provided data. This method assumes that
     * instance entities are uniquely identifiable per "unique find"
     * criteria from data on entity class.
     *
     * @param {Object} data
     * @returns {mail.messaging.entity.Entity} created or updated entity.
     */
    insert(Entity, data) {
        let entity = Entity.find(Entity._findFunctionFromData(data));
        if (!entity) {
            entity = Entity.create(data);
        } else {
            entity.update(data);
        }
        return entity;
    }

    /**
     * Process an update on provided entity with provided data. Updating
     * an entity consists of applying direct updates first (i.e. explicit
     * ones from `data`) and then indirect ones (i.e. compute/related fields
     * and "after updates").
     *
     * @param {mail.messaging.entity.Entity} entity
     * @param {Object} data
     */
    update(entity, data) {
        if (!this._isInUpdateCycle) {
            this._isInUpdateCycle = true;
            this._updateDirect(entity, data);
            while (
                this._toComputeFields.size > 0 ||
                this._toUpdateAfters.length > 0
            ) {
                if (this._toComputeFields.size > 0) {
                    this._updateComputes();
                } else {
                    this._isHandlingToUpdateAfters = true;
                    // process one update after
                    const [entityToUpdate, previous] = this._toUpdateAfters.pop();
                    if (this.classes.Entity.get(entityToUpdate)) {
                        entityToUpdate._updateAfter(previous);
                    }
                    this._isHandlingToUpdateAfters = false;
                }
            }
            this._toComputeFields.clear();
            this._isInUpdateCycle = false;
        } else {
            this._updateDirect(entity, data);
            if (this._isHandlingToUpdateAfters) {
                this._updateComputes();
            }
        }
    }

    /**
     * Register an entity field for the compute step of the update cycle in
     * progress.
     *
     * @param {mail.messaging.entity.Entity}
     * @param {mail.messaging.EntityField} field
     */
    registerToComputeField(entity, field) {
        this._toComputeFields.set(`${entity.localId}--${field.fieldName}`, true);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {mail.messaging.entity.Entity} Entity class
     * @param {Object} patch
     */
    _applyEntityPatchFields(Entity, patch) {
        for (const [fieldName, field] of Object.entries(patch)) {
            if (!Entity.fields[fieldName]) {
                Entity.fields[fieldName] = field;
            } else {
                Object.assign(Entity.fields[fieldName].dependencies, field.dependencies);
            }
        }
    }

    /**
     * @private
     * @param {Object} Entities
     * @throws {Error} in case some declared fields are not correct.
     */
    _checkDeclaredFieldsOnClasses(Entities) {
        for (const Entity of Object.values(Entities)) {
            for (const fieldName in Entity.fields) {
                const field = Entity.fields[fieldName];
                // 0. Get parented declared fields
                const parentedMatchingFields = [];
                let TargetEntity = Entity.__proto__;
                while (Entities[TargetEntity.entityName]) {
                    if (TargetEntity.fields) {
                        const matchingField = TargetEntity.fields[fieldName];
                        if (matchingField) {
                            parentedMatchingFields.push(matchingField);
                        }
                    }
                    TargetEntity = TargetEntity.__proto__;
                }
                // 1. Field type is required.
                if (!(['attribute', 'relation'].includes(field.fieldType))) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName}" has unsupported type ${field.fieldType}.`);
                }
                // 2. Invalid keys based on field type.
                if (field.fieldType === 'attribute') {
                    const invalidKeys = Object.keys(field).filter(key =>
                        ![
                            'autocreate',
                            'compute',
                            'default',
                            'dependencies',
                            'fieldType',
                            'related',
                        ].includes(key)
                    );
                    if (invalidKeys.length > 0) {
                        throw new Error(`Field "${Entity.entityName}/${fieldName}" contains some invalid keys: "${invalidKeys.join(", ")}".`);
                    }
                }
                if (field.fieldType === 'relation') {
                    const invalidKeys = Object.keys(field).filter(key =>
                        ![
                            'autocreate',
                            'compute',
                            'dependencies',
                            'fieldType',
                            'inverse',
                            'isCausal',
                            'related',
                            'relationType',
                            'to',
                        ].includes(key)
                    );
                    if (invalidKeys.length > 0) {
                        throw new Error(`Field "${Entity.entityName}/${fieldName}" contains some invalid keys: "${invalidKeys.join(", ")}".`);
                    }
                    if (!Entities[field.to]) {
                        throw new Error(`Relational field "${Entity.entityName}/${fieldName}" targets to unknown entity name "${field.to}".`);
                    }
                    if (field.isCausal && !(['one2many', 'one2one'].includes(field.relationType))) {
                        throw new Error(`Relational field "${Entity.entityName}/${fieldName}" has "isCausal" true with a relation of type "${field.relationType}" but "isCausal" is only supported for "one2many" and "one2one".`);
                    }
                }
                // 3. Computed field.
                if (field.compute && !(typeof field.compute === 'string')) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName}" property "compute" must be a string (instance method name).`);
                }
                if (field.compute && !(Entity.prototype[field.compute])) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName}" property "compute" does not refer to an instance method of this Entity class.`);
                }
                if (
                    field.dependencies &&
                    (!field.compute && !parentedMatchingFields.some(field => field.compute))
                ) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName} contains dependendencies but no compute method in itself or parented matching fields (dependencies only make sense for compute fields)."`);
                }
                if (
                    (field.compute || parentedMatchingFields.some(field => field.compute)) &&
                    (field.dependencies || parentedMatchingFields.some(field => field.dependencies))
                ) {
                    if (!(field.dependencies instanceof Array)) {
                        throw new Error(`Compute field "${Entity.entityName}/${fieldName}" dependencies must be an array of field names.`);
                    }
                    const unknownDependencies = field.dependencies.every(dependency => !(Entity.fields[dependency]));
                    if (unknownDependencies.length > 0) {
                        throw new Error(`Compute field "${Entity.entityName}/${fieldName}" contains some unknown dependencies: "${unknownDependencies.join(", ")}".`);
                    }
                }
                // 4. Related field.
                if (field.compute && field.related) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName}" cannot be a related and compute field at the same time.`);
                }
                if (field.related) {
                    if (!(typeof field.related === 'string')) {
                        throw new Error(`Field "${Entity.entityName}/${fieldName}" property "related" has invalid format.`);
                    }
                    const [relationName, relatedFieldName, other] = field.related.split('.');
                    if (!relationName || !relatedFieldName || other) {
                        throw new Error(`Field "${Entity.entityName}/${fieldName}" property "related" has invalid format.`);
                    }
                    // find relation on self or parents.
                    let relatedRelation;
                    let TargetEntity = Entity;
                    while (Entities[TargetEntity.entityName] && !relatedRelation) {
                        if (TargetEntity.fields) {
                            relatedRelation = TargetEntity.fields[relationName];
                        }
                        TargetEntity = TargetEntity.__proto__;
                    }
                    if (!relatedRelation) {
                        throw new Error(`Related field "${Entity.entityName}/${fieldName}" relates to unknown relation name "${relationName}".`);
                    }
                    if (relatedRelation.fieldType !== 'relation') {
                        throw new Error(`Related field "${Entity.entityName}/${fieldName}" relates to non-relational field "${relationName}".`);
                    }
                    // Assuming related relation is valid...
                    // find field name on related entity or any parents.
                    const RelatedEntity = Entities[relatedRelation.to];
                    let relatedField;
                    TargetEntity = RelatedEntity;
                    while (Entities[TargetEntity.entityName] && !relatedField) {
                        if (TargetEntity.fields) {
                            relatedField = TargetEntity.fields[relatedFieldName];
                        }
                        TargetEntity = TargetEntity.__proto__;
                    }
                    if (!relatedField) {
                        throw new Error(`Related field "${Entity.entityName}/${fieldName}" relates to unknown related entity field "${relatedFieldName}".`);
                    }
                    if (relatedField.fieldType !== field.fieldType) {
                        throw new Error(`Related field "${Entity.entityName}/${fieldName}" has mismatch type with its related entity field.`);
                    }
                    if (
                        relatedField.fieldType === 'relation' &&
                        relatedField.to !== field.to
                    ) {
                        throw new Error(`Related field "${Entity.entityName}/${fieldName}" has mismatch target entity name with its related entity field.`);
                    }
                }
            }
        }
    }

    /**
     * @private
     * @param {Object} Entities
     * @throws {Error} in case some fields are not correct.
     */
    _checkProcessedFieldsOnClasses(Entities) {
        for (const Entity of Object.values(Entities)) {
            for (const fieldName in Entity.fields) {
                const field = Entity.fields[fieldName];
                if (!(['attribute', 'relation'].includes(field.fieldType))) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName}" has unsupported type ${field.fieldType}.`);
                }
                if (field.compute && field.related) {
                    throw new Error(`Field "${Entity.entityName}/${fieldName}" cannot be a related and compute field at the same time.`);
                }
                if (field.fieldType === 'attribute') {
                    continue;
                }
                if (!field.relationType) {
                    throw new Error(
                        `Field "${Entity.entityName}/${fieldName}" must define a relation type in "relationType".`
                    );
                }
                if (!(['one2one', 'one2many', 'many2one', 'many2many'].includes(field.relationType))) {
                    throw new Error(
                        `Field "${Entity.entityName}/${fieldName}" has invalid relation type "${field.relationType}".`
                    );
                }
                if (!field.inverse) {
                    throw new Error(
                        `Field "${
                            Entity.entityName
                        }/${
                            fieldName
                        }" must define an inverse relation name in "inverse".`
                    );
                }
                if (!field.to) {
                    throw new Error(
                        `Relation "${
                            Entity.entityName
                        }/${
                            fieldName
                        }" must define an Entity class name in "relationTo" (1st positional parameter of relation field helpers).`
                    );
                }
                const RelatedEntity = Entities[field.to];
                if (!RelatedEntity) {
                    throw new Error(
                        `Entity class name of relation "${Entity.entityName}/${fieldName}" does not exist.`
                    );
                }
                const inverseField = RelatedEntity.fields[field.inverse];
                if (!inverseField) {
                    throw new Error(
                        `Relation entity class "${
                            Entity.entityName
                        }/${
                            fieldName
                        }" has no inverse field "${RelatedEntity.entityName}/${field.inverse}".`
                    );
                }
                if (inverseField.inverse !== fieldName) {
                    throw new Error(
                        `Inverse field name of relation "${
                            Entity.entityName
                        }/${
                            fieldName
                        }" does not match with field name of relation "${
                            RelatedEntity.entityName
                        }/${
                            inverseField.inverse
                        }".`
                    );
                }
                const allSelfAndParentNames = [];
                let target = Entity;
                while (target) {
                    allSelfAndParentNames.push(target.entityName);
                    target = target.__proto__;
                }
                if (!allSelfAndParentNames.includes(inverseField.to)) {
                    throw new Error(
                        `Relation "${
                            Entity.entityName
                        }/${
                            fieldName
                        }" has inverse relation "${
                            RelatedEntity.entityName
                        }/${
                            field.inverse
                        }" misconfigured (currently "${
                            inverseField.to
                        }", should instead refer to this entity or parented entity: ${
                            allSelfAndParentNames.map(name => `"${name}"`).join(', ')
                        }?)`
                    );
                }
                if (
                    (field.relationType === 'many2many' && inverseField.relationType !== 'many2many') ||
                    (field.relationType === 'one2one' && inverseField.relationType !== 'one2one') ||
                    (field.relationType === 'one2many' && inverseField.relationType !== 'many2one') ||
                    (field.relationType === 'many2one' && inverseField.relationType !== 'one2many')
                ) {
                    throw new Error(
                        `Mismatch relations types "${
                            Entity.entityName
                        }/${
                            fieldName
                        }" (${
                            field.relationType
                        }) and "${
                            RelatedEntity.entityName
                        }/${
                            field.inverse
                        }" (${
                            inverseField.relationType
                        }).`
                    );
                }
            }
        }
    }

    /**
     * @private
     * @returns {Object}
     * @throws {Error} in case it cannot generate Entity classes.
     */
    _generateClasses() {
        const allNames = Object.keys(registry);
        const Entities = {};
        const generatedNames = [];
        let toGenerateNames = [...allNames];
        while (toGenerateNames.length > 0) {
            const generatable = toGenerateNames.map(name => registry[name]).find(entry => {
                let isGenerateable = true;
                for (const dependencyName of entry.dependencies) {
                    if (!generatedNames.includes(dependencyName)) {
                        isGenerateable = false;
                    }
                }
                return isGenerateable;
            });
            if (!generatable) {
                throw new Error(`Cannot generate following Entity classes: ${toGenerateNames.split(', ')}`);
            }
            // Make environment accessible from Entity.
            const Entity = generatable.factory(Entities);
            Object.defineProperty(Entity, 'env', { get: () => this.env });
            for (const patch of generatable.patches) {
                switch (patch.type) {
                    case 'class':
                        patchClassMethods(Entity, patch.name, patch.patch);
                        break;
                    case 'instance':
                        patchInstanceMethods(Entity, patch.name, patch.patch);
                        break;
                    case 'field':
                        this._applyEntityPatchFields(Entity, patch.patch);
                        break;
                }
            }
            if (!Entity.entityName) {
                throw new Error(`Missing static property "entityName" on Entity class "${Entity.name}".`);
            }
            if (generatedNames.includes(Entity.entityName)) {
                throw new Error(`Duplicate entity name "${Entity.entityName}" shared on 2 distinct Entity classes.`);
            }
            Entities[Entity.entityName] = Entity;
            generatedNames.push(Entity.entityName);
            toGenerateNames = toGenerateNames.filter(name => name !== Entity.entityName);
        }
        /**
         * Check that declared entity fields are correct.
         */
        this._checkDeclaredFieldsOnClasses(Entities);
        /**
         * Process declared entity fields definitions, so that these field
         * definitions are much easier to use in the system. For instance, all
         * relational field definitions have an inverse, or fields track all their
         * dependents.
         */
        this._processDeclaredFieldsOnClasses(Entities);
        /**
         * Check that all entity fields are correct, notably one relation
         * should have matching reversed relation.
         */
        this._checkProcessedFieldsOnClasses(Entities);
        return Entities;
    }

    /**
     * Make default values of its fields for newly created entity.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     */
    _makeDefaults(entity) {
        for (const field of Object.values(entity.constructor.fields)) {
            if (field.fieldType === 'attribute') {
                field.write(entity, field.default, { registerDependents: false });
            }
            if (field.fieldType === 'relation') {
                if (['one2many', 'many2many'].includes(field.relationType)) {
                    // Ensure X2many relations are arrays by defaults.
                    field.write(entity, [], { registerDependents: false });
                } else {
                    field.write(entity, undefined, { registerDependents: false });
                }
            }
        }
    }

    /**
     * @private
     * @param {mail.messaging.entity.Entity} Entity class
     * @param {Object} field
     * @returns {Object}
     */
    _makeInverseRelationField(Entity, field) {
        const relFunc =
            field.relationType === 'many2many' ? EntityField.many2many
            : field.relationType === 'many2one' ? EntityField.one2many
            : field.relationType === 'one2many' ? EntityField.many2one
            : field.relationType === 'one2one' ? EntityField.one2one
            : undefined;
        if (!relFunc) {
            throw new Error(`Cannot compute inverse Relation of "${Entity.entityName}/${field.fieldName}".`);
        }
        const inverseField = new EntityField(Object.assign(
            {},
            relFunc(Entity.entityName, { inverse: field.fieldName }),
            {
                entityManager: this,
                fieldName: `_inverse_${Entity.entityName}/${field.fieldName}`,
            }
        ));
        return inverseField;
    }

    /**
     * Wrap entity that has just been created in a proxy. Proxy is useful for
     * auto-getting entities when accessing relational fields.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @return {Proxy} proxified entity
     */
    _makeProxifiedEntity(entity) {
        const proxifiedEntity = new Proxy(entity, {
            get: (target, k) => {
                if (k === 'constructor') {
                    return target[k];
                }
                const field = target.constructor.fields[k];
                if (!field) {
                    // No crash, we allow these reads due to patch()
                    // implementation details that read on `this._super` even
                    // if not set before-hand.
                    return target[k];
                }
                return field.get(proxifiedEntity);
            },
            set: (target, k, newVal) => {
                if (target.constructor.fields[k]) {
                    throw new Error("Forbidden to write on entity field without .update()!!");
                } else {
                    // No crash, we allow these writes due to following concerns:
                    // - patch() implementation details that write on `this._super`
                    // - entity listeners that need setting on this with `.bind(this)`
                    target[k] = newVal;
                }
                return true;
            },
        });
        return proxifiedEntity;
    }

    /**
     * This function processes definition of declared fields in provided entities.
     * Basically, entities have fields declared in static prop `fields`, and this
     * function processes and modifies them in place so that they are fully
     * configured. For instance, entity relations need bi-directional mapping, but
     * inverse relation may be omitted in declared field: this function auto-fill
     * this inverse relation.
     *
     * @private
     * @param {Object} Entities
     */
    _processDeclaredFieldsOnClasses(Entities) {
        /**
         * 1. Prepare fields.
         */
        for (const Entity of Object.values(Entities)) {
            if (!Entity.hasOwnProperty('fields')) {
                Entity.fields = {};
            }
            Entity.inverseRelations = [];
            // Make fields aware of their field name.
            for (const [fieldName, fieldData] of Object.entries(Entity.fields)) {
                Entity.fields[fieldName] = new EntityField(Object.assign({}, fieldData, {
                    entityManager: this,
                    fieldName,
                }));
            }
        }
        /**
         * 2. Auto-generate definitions of undeclared inverse relations.
         */
        for (const Entity of Object.values(Entities)) {
            for (const field of Object.values(Entity.fields)) {
                if (field.fieldType !== 'relation') {
                    continue;
                }
                if (field.inverse) {
                    continue;
                }
                const RelatedEntity = Entities[field.to];
                const inverseField = this._makeInverseRelationField(Entity, field);
                field.inverse = inverseField.fieldName;
                RelatedEntity.fields[inverseField.fieldName] = inverseField;
            }
        }
        /**
         * 3. Generate dependents and inverse-relates on fields.
         * Field definitions are not yet combined, so registration of `dependents`
         * may have to walk structural hierarchy of entity classes in order to find
         * the appropriate field. Also, while dependencies are defined just with
         * field names, dependents require an additional data called a "hash"
         * (= field id), which is a way to identify dependents in an inverse
         * relation. This is necessary because dependents are a subset of an inverse
         * relation.
         */
        for (const Entity of Object.values(Entities)) {
            for (const field of Object.values(Entity.fields)) {
                for (const dependencyFieldName of field.dependencies) {
                    let TargetEntity = Entity;
                    let dependencyField = TargetEntity.fields[dependencyFieldName];
                    while (!dependencyField) {
                        TargetEntity = TargetEntity.__proto__;
                        dependencyField = TargetEntity.fields[dependencyFieldName];
                    }
                    dependencyField.dependents = [
                        ...new Set(
                            dependencyField.dependents.concat(
                                [`${field.id}.${field.fieldName}`]
                            )
                        )
                    ];
                }
                if (field.related) {
                    const [relationName, relatedFieldName] = field.related.split('.');
                    let TargetEntity = Entity;
                    let relationField = TargetEntity.fields[relationName];
                    while (!relationField) {
                        TargetEntity = TargetEntity.__proto__;
                        relationField = TargetEntity.fields[relationName];
                    }
                    relationField.dependents = [
                        ...new Set(
                            relationField.dependents.concat(
                                [`${field.id}.${field.fieldName}`]
                            )
                        )
                    ];
                    const OtherEntity = Entities[relationField.to];
                    let OtherTargetEntity = OtherEntity;
                    let relatedField = OtherTargetEntity.fields[relatedFieldName];
                    while (!relatedField) {
                        OtherTargetEntity = OtherEntity.__proto__;
                        relatedField = OtherTargetEntity.fields[relatedFieldName];
                    }
                    relatedField.dependents = [
                        ...new Set(
                            relatedField.dependents.concat(
                                [`${field.id}.${relationField.inverse}.${field.fieldName}`]
                            )
                        )
                    ];
                }
            }
        }
        /**
         * 4. Extend definition of fields of an entity with the definition of
         * fields of its parents. Field definitions on self has precedence over
         * parented fields.
         */
        for (const Entity of Object.values(Entities)) {
            Entity.__combinedFields = {};
            for (const field of Object.values(Entity.fields)) {
                Entity.__combinedFields[field.fieldName] = field;
            }
            let TargetEntity = Entity.__proto__;
            while (TargetEntity && TargetEntity.fields) {
                for (const targetField of Object.values(TargetEntity.fields)) {
                    const field = Entity.__combinedFields[targetField.fieldName];
                    if (field) {
                        Entity.__combinedFields[targetField.fieldName] = field.combine(targetField);
                    } else {
                        Entity.__combinedFields[targetField.fieldName] = targetField;
                    }
                }
                TargetEntity = TargetEntity.__proto__;
            }
        }
        for (const Entity of Object.values(Entities)) {
            Entity.fields = Entity.__combinedFields;
            delete Entity.__combinedFields;
        }
    }

    /**
     * Process registered computed fields in the current update cycle.
     *
     * @private
     */
    _updateComputes() {
        while (this._toComputeFields.size > 0) {
            // process one compute field
            const key = this._toComputeFields.keys().next().value;
            const [entityLocalId, fieldName] = key.split('--');
            this._toComputeFields.delete(key);
            const entity = this.classes.Entity.get(entityLocalId);
            if (entity) {
                const field = entity.constructor.fields[fieldName];
                field.doCompute(entity);
            }
        }
    }

    /**
     * Process a direct update on given entity with provided data.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {Object} data
     */
    _updateDirect(entity, data) {
        const existing = this._toUpdateAfters.find(entry => entry[0] === entity);
        if (!existing) {
            // queue updateAfter before calling field.set to ensure previous
            // contains the value at the start of update cycle
            this._toUpdateAfters.push([entity, entity._updateBefore()]);
        }
        for (const [k, v] of Object.entries(data)) {
            const field = entity.constructor.fields[k];
            if (!field) {
                throw new Error(`Cannot create/update entity with data unrelated to a field. (entity name: "${entity.constructor.entityName}", non-field attempted update: "${k}")`);
            }
            field.set(entity, v);
        }
    }

}

return EntityManager;

});
