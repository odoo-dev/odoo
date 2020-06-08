odoo.define('mail.messaging.EntityField', function (require) {
'use strict';

/**
 * Class whose instances represent field on a entity class.
 * These field definitions are generated from declared fields in static prop
 * `fields` on the entity classes.
 */
class EntityField {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    constructor({
        autocreate = false,
        compute,
        default: def,
        dependencies = [],
        dependents = [],
        entityManager,
        fieldName,
        fieldType,
        hashes: extraHashes = [],
        inverse,
        isCausal = false,
        related,
        relationType,
        to,
    } = {}) {
        const id = _.uniqueId('field_');
        /**
         * This prop only makes sense for fields of type "relation". If set,
         * it automatically creates a new entity for this field on creation of
         * entity, and auto-links with this entity.
         */
        this.autocreate = autocreate;
        /**
         * If set, this field acts as a computed field, and this prop
         * contains the name of the instance method that computes the value
         * for this field. This compute method is called on creation of entity
         * and whenever some of its dependencies change. @see dependencies
         */
        this.compute = compute;
        /**
         * Default value for this field. Used on creation of this field, to
         * set a value by default.
         */
        this.default = def;
        /**
         * List of field on current entity that this field depends on for its
         * `compute` method. Useful to determine whether this field should be
         * registered for recomputation when some entity fields have changed.
         * This list must be declared in entity definition, or compute method
         * is only computed once.
         */
        this.dependencies = dependencies;
        /**
         * List of fields that are dependent of this field. They should never
         * be declared, and are automatically generated while normalizing
         * fields. This is populated by compute `dependencies` and `related`.
         */
        this.dependents = dependents;
        /**
         * Reference to the entity manager.
         */
        this.entityManager = entityManager;
        /**
         * Name of the field in the definition of fields on entity.
         */
        this.fieldName = fieldName;
        /**
         * Type of this field. 2 types of fields are currently supported:
         *
         *   1. 'attribute': fields that store primitive values like integers,
         *                   booleans, strings, objects, array, etc.
         *
         *   2. 'relation': fields that relate to some other entities.
         */
        this.fieldType = fieldType;
        /**
         * List of hashes registered on this field definition. Technical
         * prop that is specifically used in processing of dependent
         * fields, useful to clearly identify which fields of a relation are
         * dependents and must be registered for computed. Indeed, not all
         * related entities may have a field that depends on changed field,
         * especially when dependency is defined on sub-entity on a relation in
         * a super-entity.
         *
         * To illustrate the purpose of this hash, suppose following definition
         * of entity and fields:
         *
         * - 3 entities (A, B, C) and 3 fields (x, y, z)
         * - A.fields: { x: one2one(C, inverse: x') }
         * - B extends A
         * - B.fields: { z: related(x.y) }
         * - C.fields: { y: attribute }
         *
         * Visually:
         *               x'
         *          <-----------
         *        A -----------> C { y }
         *        ^      x
         *        |
         *        | (extends)
         *        |
         *        B { z = x.y }
         *
         * If z has a dependency on x.y, it means y has a dependent on x'.z.
         * Note that field z exists on B but not on all A. To determine which
         * kinds of entities in relation x' are dependent on y, y is aware of an
         * hash on this dependent, and any dependents who has this hash in list
         * of hashes are actual dependents.
         */
        this.hashes = extraHashes.concat([id]);
        /**
         * Identification for this field definition. Useful to map a dependent
         * from a dependency. Indeed, declared field definitions use
         * 'dependencies' but technical process need inverse as 'dependents'.
         * Dependencies just need name of fields, but dependents cannot just
         * rely on inverse field names because these dependents are a subset.
         */
        this.id = id;
        /**
         * This prop only makes sense in a relational field. This contains
         * the name of the field name in the inverse relation. This may not
         * be defined in declared field definitions, but processed relational
         * field definitions always have inverses.
         */
        this.inverse = inverse;
        /**
         * This prop only makes sense in a relational field. If set, when this
         * relation is removed, the related entity is automatically deleted.
         */
        this.isCausal = isCausal;
        /**
         * If set, this field acts as a related field, and this prop contains
         * a string that references the related field. It should have the
         * following format: '<relationName>.<relatedFieldName>', where
         * <relationName> is a relational field name on this entity or a parent
         * entity (note: could itself be computed or related), and
         * <relatedFieldName> is the name of field on the entities that are
         * related to current entity from this relation. When there are more
         * than one entity in the relation, it maps all related fields per
         * entity in relation.
         */
        this.related = related;
        /**
         * This prop only makes sense in a relational field. Determine which
         * type of relation there is between current entity and other entities.
         * 4 types of relation are supported: 'one2one', 'one2many', 'many2one'
         * and 'many2many'.
         */
        this.relationType = relationType;
        /**
         * This prop only makes sense in a relational field. Determine which
         * entity name this relation refers to.
         */
        this.to = to;
    }

    /**
     * Define an attribute field.
     *
     * @param {Object} [options]
     * @returns {Object}
     */
    static attr(options) {
        return Object.assign({ fieldType: 'attribute' }, options);
    }

    /**
     * Define a many2many field.
     *
     * @param {string} entityClassName
     * @param {Object} [options]
     * @returns {Object}
     */
    static many2many(entityClassName, options) {
        return EntityField._relation(entityClassName, Object.assign({}, options, { relationType: 'many2many' }));
    }

    /**
     * Define a many2one field.
     *
     * @param {string} entityClassName
     * @param {Object} [options]
     * @returns {Object}
     */
    static many2one(entityClassName, options) {
        return EntityField._relation(entityClassName, Object.assign({}, options, { relationType: 'many2one' }));
    }

    /**
     * Define a one2many field.
     *
     * @param {string} entityClassName
     * @param {Object} [options]
     * @returns {Object}
     */
    static one2many(entityClassName, options) {
        return EntityField._relation(entityClassName, Object.assign({}, options, { relationType: 'one2many' }));
    }

    /**
     * Define a one2one field.
     *
     * @param {string} entityClassName
     * @param {Object} [options]
     * @returns {Object}
     */
    static one2one(entityClassName, options) {
        return EntityField._relation(entityClassName, Object.assign({}, options, { relationType: 'one2one' }));
    }

    /**
     * Combine current field definition with provided field definition and
     * return the combined field definition. Useful to track list of hashes of
     * a given field, which is necessary for the working of dependent fields
     * (computed and related fields).
     *
     * @param {mail.messaging.EntityField} field
     * @returns {mail.messaging.EntityField}
     */
    combine(field) {
        return new EntityField(Object.assign({}, this, {
            dependencies: this.dependencies.concat(field.dependencies),
            hashes: this.hashes.concat(field.hashes),
        }));
    }

    /**
     * Perform computation of this field, which is either a computed or related
     * field.
     *
     * @param {mail.messaging.entity.Entity} entity
     */
    doCompute(entity) {
        if (this.compute) {
            this.set(entity, entity[this.compute]());
            return;
        }
        if (this.related) {
            this.set(entity, this._computeRelated(entity));
            return;
        }
        throw new Error("No compute method defined on this field definition");
    }

    /**
     * Get the messaging env.
     *
     * @returns {mail.messaging.messaging_env}
     */
    get env() {
        return this.entityManager.env;
    }

    /**
     * Get the value associated to this field. Relations must convert entity
     * local ids to entities instances.
     *
     * @param {mail.messaging.entity.Entity} entity
     * @returns {any}
     */
    get(entity) {
        if (this.fieldType === 'attribute') {
            return this.read(entity);
        }
        if (this.fieldType === 'relation') {
            const OtherEntity = this.env.entities[this.to];
            if (['one2one', 'many2one'].includes(this.relationType)) {
                return OtherEntity.get(this.read(entity));
            }
            return this.read(entity)
                .map(localId => OtherEntity.get(localId))
                /**
                 * FIXME: Stored relation may still contain
                 * outdated entities.
                 */
                .filter(entity => !!entity);
        }
        throw new Error(`cannot get field with unsupported type ${this.fieldType}.`);
    }

    /**
     * Get the raw value associated to this field. For relations, this means
     * the local id or list of local ids of entities in this relational field.
     *
     * @param {mail.messaging.entity.Entity} entity
     * @returns {any}
     */
    read(entity) {
        return entity.__state[this.fieldName];
    }

    /**
     * Set a value on this field. The format of the value comes from business
     * code.
     *
     * @param {mail.messaging.entity.Entity} entity
     * @param {any} newVal
     */
    set(entity, newVal) {
        if (this.fieldType === 'attribute') {
            this.write(entity, newVal);
        }
        if (this.fieldType === 'relation') {
            for (const val of newVal) {
                switch (val[0]) {
                    case 'create':
                        this._setRelationCreate(entity, val[1]);
                        break;
                    case 'insert':
                        this._setRelationInsert(entity, val[1]);
                        break;
                    case 'insert-and-replace':
                        this._setRelationInsertAndReplace(entity, val[1]);
                        break;
                    case 'link':
                        this._setRelationLink(entity, val[1]);
                        break;
                    case 'replace':
                        // TODO IMP replace should not unlink-all (task-2270780)
                        this._setRelationUnlink(entity, null);
                        this._setRelationLink(entity, val[1]);
                        break;
                    case 'unlink':
                        this._setRelationUnlink(entity, val[1]);
                        break;
                    case 'unlink-all':
                        this._setRelationUnlink(entity, null);
                        break;
                }
            }
        }
    }

    /**
     * Set a value in state associated to this field. Value corresponds exactly
     * that what is stored on this field, like local id or list of local ids
     * for a relational field. If the value changes, dependent fields are
     * automatically registered for (re-)computation.
     *
     * @param {mail.messaging.entity.Entity} entity
     * @param {any} newVal
     * @param {Object} [param2={}]
     * @param {Object} [param2.registerDependents=true] If set, write
     *   on this field with changed value registers dependent fields for compute.
     *   Of course, we almost always want to register them, so that they reflect
     *   the value with their dependencies. Disabling this feature prevents
     *   useless potentially heavy computation, like when setting default values.
     */
    write(entity, newVal, { registerDependents = true } = {}) {
        if (this.read(entity) === newVal) {
            return;
        }
        const prevStringified = JSON.stringify(this.read(entity));
        entity.__state[this.fieldName] = newVal;
        const newStringified = JSON.stringify(this.read(entity));
        if (this._containsEntity(newVal)) {
            throw new Error("Forbidden write operation with entities in the __state!!");
        }
        if (newStringified === prevStringified) {
            // value unchanged, don't need to compute dependent fields
            return;
        }
        if (!registerDependents) {
            return;
        }

        // flag all dependent fields for compute
        for (const dependent of this.dependents) {
            const [hash, currentFieldName, relatedFieldName] = dependent.split('.');
            if (relatedFieldName) {
                const relationField = entity.constructor.fields[currentFieldName];
                if (['one2many', 'many2many'].includes(relationField.relationType)) {
                    for (const otherEntity of entity[currentFieldName]) {
                        const field = otherEntity.constructor.fields[relatedFieldName];
                        if (field && field.hashes.includes(hash)) {
                            this.entityManager.registerToComputeField(otherEntity, field);
                        }
                    }
                } else {
                    if (!entity[currentFieldName]) {
                        continue;
                    }
                    const otherEntity = entity[currentFieldName];
                    const field = otherEntity.constructor.fields[relatedFieldName];
                    if (field && field.hashes.includes(hash)) {
                        this.entityManager.registerToComputeField(otherEntity, field);
                    }
                }
            } else {
                const field = entity.constructor.fields[currentFieldName];
                if (field && field.hashes.includes(hash)) {
                    this.entityManager.registerToComputeField(entity, field);
                }
            }
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {string} entityClassName
     * @param {Object} [options]
     */
    static _relation(entityClassName, options) {
        return Object.assign({
            fieldType: 'relation',
            to: entityClassName,
        }, options);
    }

    /**
     * Compute method when this field is related.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     */
    _computeRelated(entity) {
        const [relationName, relatedFieldName] = this.related.split('.');
        const relationField = entity.constructor.fields[relationName];
        if (['one2many', 'many2many'].includes(relationField.relationType)) {
            const newVal = [];
            for (const otherEntity of entity[relationName]) {
                const otherField = otherEntity.constructor.fields[relatedFieldName];
                const otherValue = otherField.get(otherEntity);
                if (otherValue) {
                    if (otherValue instanceof Array) {
                        // avoid nested array if otherField is x2many too
                        // TODO IMP task-2261221
                        for (const v of otherValue) {
                            newVal.push(v);
                        }
                    } else {
                        newVal.push(otherValue);
                    }
                }
            }
            if (this.fieldType === 'relation') {
                return [['replace', newVal]];
            }
            return newVal;
        }
        const otherEntity = entity[relationName];
        if (otherEntity) {
            const otherField = otherEntity.constructor.fields[relatedFieldName];
            const newVal = otherField.get(otherEntity);
            if (this.fieldType === 'relation') {
                if (newVal) {
                    return [['replace', newVal]];
                } else {
                    return [['unlink-all']];
                }
            }
            return newVal;
        }
        if (this.fieldType === 'relation') {
            return [];
        }
    }

    /**
     * Determines whether the provided value contains an entity. Useful to
     * prevent writing entity directly in state of this field, which should be
     * treated as buggy design. Indeed, state of field should only contain
     * either a primitive type or a simple datastructure containing itself
     * simple datastructures too.
     *
     * @private
     * @param {any} val
     * @returns {boolean}
     */
    _containsEntity(val) {
        if (!val) {
            return false;
        }
        if (val instanceof this.env.entities.Entity) {
            return true;
        }
        if (!(val instanceof Array)) {
            return false;
        }
        if (val.length > 0 && val[0] instanceof this.env.entities.Entity) {
            return true;
        }
        return false;
    }

    /**
     * Converts given value to expected format for x2many processing, which is
     * an array of localId.
     *
     * @private
     * @param {string|mail.messaging.entity.Entity|<mail.messaging.entity.Entity|string>[]} newValue
     * @returns {string[]}
     */
    _setRelationConvertX2ManyValue(newValue) {
        if (newValue instanceof Array) {
            return newValue.map(v => this._setRelationConvertX2OneValue(v));
        }
        return [this._setRelationConvertX2OneValue(newValue)];
    }

    /**
     * Converts given value to expected format for x2one processing, which is
     * a localId.
     *
     * @private
     * @param {string|mail.messaging.entity.Entity} newValue
     * @returns {string}
     */
    _setRelationConvertX2OneValue(newValue) {
        return newValue instanceof this.env.entities.Entity ? newValue.localId : newValue;
    }

    /**
     * Set on this relational field in 'create' mode. Basically data provided
     * during set on this relational field contain data to create new entities,
     * which themselves must be linked to entity of this field by means of
     * this field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {Object|Object[]} data
     */
    _setRelationCreate(entity, data) {
        const OtherEntity = this.env.entities[this.to];
        let other;
        if (['one2one', 'many2one'].includes(this.relationType)) {
            other = OtherEntity.create(data);
        } else {
            if (data instanceof Array) {
                other = data.map(d => OtherEntity.create(d));
            } else {
                other = OtherEntity.create(data);
            }
        }
        this._setRelationLink(entity, other);
    }

    /**
     * Set on this relational field in 'insert' mode. Basically data provided
     * during set on this relational field contain data to insert entities,
     * which themselves must be linked to entity of this field by means of
     * this field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {Object|Object[]} data
     */
    _setRelationInsert(entity, data) {
        const OtherEntity = this.env.entities[this.to];
        let other;
        if (['one2one', 'many2one'].includes(this.relationType)) {
            other = OtherEntity.insert(data);
        } else {
            if (data instanceof Array) {
                other = data.map(d => OtherEntity.insert(d));
            } else {
                other = OtherEntity.insert(data);
            }
        }
        this._setRelationLink(entity, other);
    }

    /**
     * Set on this relational field in 'insert-and-repalce' mode. Basically
     * data provided during set on this relational field contain data to insert
     * entities, which themselves must replace value on this field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {Object|Object[]} data
     */
    _setRelationInsertAndReplace(entity, data) {
        // unlink must be done before insert:
        // because unlink might trigger delete due to causality and new data
        // shouldn't be deleted just after being inserted
        // TODO IMP insert-and-replace should not unlink-all (task-2270780)
        this._setRelationUnlink(entity, null);
        const OtherEntity = this.env.entities[this.to];
        let other;
        if (['one2one', 'many2one'].includes(this.relationType)) {
            other = OtherEntity.insert(data);
        } else {
            if (data instanceof Array) {
                other = data.map(d => OtherEntity.insert(d));
            } else {
                other = OtherEntity.insert(data);
            }
        }
        this._setRelationLink(entity, other);
    }

    /**
     * Set a 'link' operation on this relational field.
     *
     * @private
     * @param {string|string[]|mail.messaging.entity.Entity|mail.messaging.entity.Entity[]} newValue
     */
    _setRelationLink(entity, newValue) {
        if (!entity.constructor.get(entity)) {
            // current entity may be deleted due to causality
            return;
        }
        switch (this.relationType) {
            case 'many2many':
                this._setRelationLinkMany2Many(entity, newValue);
                break;
            case 'many2one':
                this._setRelationLinkMany2One(entity, newValue);
                break;
            case 'one2many':
                this._setRelationLinkOne2Many(entity, newValue);
                break;
            case 'one2one':
                this._setRelationLinkOne2One(entity, newValue);
                break;
        }
    }

    /**
     * Handling of a `set` 'link' of a many2many relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|mail.messaging.entity.Entity|<mail.messaging.entity.Entity|string>[]} newValue
     */
    _setRelationLinkMany2Many(entity, newValue) {
        // convert newValue to array of localId
        const newLocalIds = this._setRelationConvertX2ManyValue(newValue);
        const OtherEntity = this.env.entities[this.to];

        for (const newLocalId of newLocalIds) {
            // read in loop to catch potential changes from previous iteration
            const prevLocalIds = this.read(entity);

            // other entity already linked, avoid linking twice
            if (prevLocalIds.includes(newLocalId)) {
                continue;
            }

            const newOtherEntity = OtherEntity.get(newLocalId);
            // other entity may be deleted due to causality, avoid linking
            // deleted entities
            if (!newOtherEntity) {
                continue;
            }

            // link other entity to current entity
            this.write(entity, prevLocalIds.concat([newLocalId]));

            // link current entity to other entity
            newOtherEntity.update({
                [this.inverse]: [['link', entity]],
            });
        }
    }

    /**
     * Handling of a `set` 'link' of a many2one relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|mail.messaging.entity.Entity} newValue
     */
    _setRelationLinkMany2One(entity, newValue) {
        // convert newValue to localId
        const newLocalId = this._setRelationConvertX2OneValue(newValue);
        const OtherEntity = this.env.entities[this.to];
        const prevLocalId = this.read(entity);

        // other entity already linked, avoid linking twice
        if (prevLocalId === newLocalId) {
            return;
        }

        // unlink previous other entity from current entity
        this.write(entity, undefined);

        const prevOtherEntity = OtherEntity.get(prevLocalId);
        // there may be no previous other entity or the previous other entity
        // may be deleted due to causality
        if (prevOtherEntity) {
            // unlink current entity from previous other entity
            prevOtherEntity.update({
                [this.inverse]: [['unlink', entity]],
            });
        }

        const newOtherEntity = OtherEntity.get(newLocalId);
        // other entity may be deleted due to causality, avoid linking
        // deleted entities
        if (!newOtherEntity) {
            return;
        }

        // link other entity to current entity
        this.write(entity, newLocalId);

        // link current entity to other entity
        newOtherEntity.update({
            [this.inverse]: [['link', entity]],
        });
    }

    /**
     * Handling of a `set` 'link' of an one2many relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|mail.messaging.entity.Entity|<string|mail.messaging.entity.Entity>[]} newValue
     */
    _setRelationLinkOne2Many(entity, newValue) {
        // convert newValue to array of localId
        const newLocalIds = this._setRelationConvertX2ManyValue(newValue);
        const OtherEntity = this.env.entities[this.to];

        for (const newLocalId of newLocalIds) {
            // read in loop to catch potential changes from previous iteration
            const prevLocalIds = this.read(entity);

            // other entity already linked, avoid linking twice
            if (prevLocalIds.includes(newLocalId)) {
                continue;
            }

            const newOtherEntity = OtherEntity.get(newLocalId);
            // other entity may be deleted due to causality, avoid linking
            // deleted entities
            if (!newOtherEntity) {
                continue;
            }

            // link other entity to current entity
            this.write(entity, prevLocalIds.concat([newLocalId]));

            // link current entity to other entity
            newOtherEntity.update({
                [this.inverse]: [['link', entity]],
            });
        }
    }

    /**
     * Handling of a `set` 'link' of an one2one relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|mail.messaging.entity.Entity} value
     */
    _setRelationLinkOne2One(entity, newValue) {
        // convert newValue to localId
        const newLocalId = this._setRelationConvertX2OneValue(newValue);
        const prevLocalId = this.read(entity);
        const OtherEntity = this.env.entities[this.to];

        // other entity already linked, avoid linking twice
        if (prevLocalId === newLocalId) {
            return;
        }

        // unlink previous other entity from current entity
        this.write(entity, undefined);

        const prevOtherEntity = OtherEntity.get(prevLocalId);
        // there may be no previous other entity or the previous other entity
        // may be deleted due to causality
        if (prevOtherEntity) {
            // unlink current entity from previous other entity
            prevOtherEntity.update({
                [this.inverse]: [['unlink', entity]],
            });
            // apply causality
            if (this.isCausal) {
                prevOtherEntity.delete();
            }
        }

        const newOtherEntity = OtherEntity.get(newLocalId);
        // other entity may be deleted due to causality, avoid linking deleted
        // entities
        if (!newOtherEntity) {
            return;
        }

        // link other entity to current entity
        this.write(entity, newLocalId);

        // link current entity to other entity
        newOtherEntity.update({
            [this.inverse]: [['link', entity]],
        });
    }

    /**
     * Set an 'unlink' operation on this relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|string[]|mail.messaging.entity.Entity|mail.messaging.entity.Entity[]|null} newValue
     */
    _setRelationUnlink(entity, newValue) {
        if (!entity.constructor.get(entity)) {
            // current entity may be deleted due to causality
            return;
        }
        switch (this.relationType) {
            case 'many2many':
                this._setRelationUnlinkMany2Many(entity, newValue);
                break;
            case 'many2one':
                this._setRelationUnlinkMany2One(entity);
                break;
            case 'one2many':
                this._setRelationUnlinkOne2Many(entity, newValue);
                break;
            case 'one2one':
                this._setRelationUnlinkOne2One(entity);
                break;
        }
    }

    /**
     * Handling of a `set` 'unlink' of a many2many relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|mail.messaging.entity.Entity|<string|mail.messaging.entity.Entity>[]|null} newValue
     */
    _setRelationUnlinkMany2Many(entity, newValue) {
        // convert newValue to array of localId, null is considered unlink all
        const otherLocalIds = newValue === null
            ? [...this.read(entity)]
            : this._setRelationConvertX2ManyValue(newValue);
        const OtherEntity = this.env.entities[this.to];

        for (const otherLocalId of otherLocalIds) {
            // read in loop to catch potential changes from previous iteration
            const prevLocalIds = this.read(entity);

            // other entity already unlinked, avoid useless processing
            if (!prevLocalIds.includes(otherLocalId)) {
                continue;
            }

            // unlink other entity from current entity
            this.write(entity, prevLocalIds.filter(
                localId => localId !== otherLocalId
            ));

            const otherEntity = OtherEntity.get(otherLocalId);
            // other entity may be deleted due to causality, avoid useless
            // processing
            if (otherEntity) {
                // unlink current entity from other entity
                otherEntity.update({
                    [this.inverse]: [['unlink', entity]],
                });
            }
        }
    }

    /**
     * Handling of a `set` 'unlink' of a many2one relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     */
    _setRelationUnlinkMany2One(entity) {
        const otherLocalId = this.read(entity);
        const OtherEntity = this.env.entities[this.to];

        // other entity already unlinked, avoid useless processing
        if (!otherLocalId) {
            return;
        }

        // unlink other entity from current entity
        this.write(entity, undefined);

        const otherEntity = OtherEntity.get(otherLocalId);
        // other entity may be deleted due to causality, avoid useless
        // processing
        if (otherEntity) {
            // unlink current entity from other entity
            otherEntity.update({
                [this.inverse]: [['unlink', entity]],
            });
        }
    }

    /**
     * Handling of a `set` 'unlink' of an one2many relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     * @param {string|mail.messaging.entity.Entity|<string|mail.messaging.entity.Entity>[]|null} newValue
     *   if null, unlink all items in the relation of provided entity.
     */
    _setRelationUnlinkOne2Many(entity, newValue) {
        // convert newValue to array of localId, null is considered unlink all
        const otherLocalIds = newValue === null
            ? [...this.read(entity)]
            : this._setRelationConvertX2ManyValue(newValue);
        const OtherEntity = this.env.entities[this.to];

        for (const otherLocalId of otherLocalIds) {
            // read in loop to catch potential changes from previous iteration
            const prevLocalIds = this.read(entity);

            // other entity already unlinked, avoid useless processing
            if (!prevLocalIds.includes(otherLocalId)) {
                continue;
            }

            // unlink other entity from current entity
            this.write(entity, prevLocalIds.filter(
                localId => localId !== otherLocalId
            ));

            const otherEntity = OtherEntity.get(otherLocalId);
            // other entity may be deleted due to causality, avoid useless
            // processing
            if (otherEntity) {
                // unlink current entity from other entity
                otherEntity.update({
                    [this.inverse]: [['unlink', entity]],
                });
            }
        }
    }

    /**
     * Handling of a `set` 'unlink' of an one2one relational field.
     *
     * @private
     * @param {mail.messaging.entity.Entity} entity
     */
    _setRelationUnlinkOne2One(entity) {
        const otherLocalId = this.read(entity);
        const OtherEntity = this.env.entities[this.to];

        // other entity already unlinked, avoid useless processing
        if (!otherLocalId) {
            return;
        }

        // unlink other entity from current entity
        this.write(entity, undefined);

        const otherEntity = OtherEntity.get(otherLocalId);
        // other entity may be deleted due to causality, avoid useless
        // processing
        if (otherEntity) {
            // unlink current entity from other entity
            otherEntity.update({
                [this.inverse]: [['unlink', entity]],
            });
        }
    }

}

return EntityField;

});
