odoo.define('mail.messaging.entity.Entity', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entity.core');

const STORED_RELATION_PREFIX = `_`;

function EntityFactory() {

    class Entity {

        /**
         * @static
         * @param {Object} [data]
         */
        static init(data) {
            const { state } = this.env.store;
            this.localId = this.name;
            state.entities[this.localId] = this;
            /**
             * Classes are functions, and changes in functions are not observed
             * by OWL. The work-around is to store data and relations of classes
             * in an object, and make this object observed from store state.
             */
            state.__classEntityObservables[this.localId] = {};
            this.observable = state.__classEntityObservables[this.localId];

            // Class stored relation access (redirect to observable)
            for (const relationName in this.relations) {
                Object.defineProperty(this, this.__getStoredRelationName(relationName), {
                    get: () => this.observable[this.__getStoredRelationName(relationName)],
                });
            }

            // Class attribute access (redirect to observable)
            const classAttributeNames = this._getListOfClassAttributeNames();
            for (const classAttributeName of classAttributeNames) {
                Object.defineProperty(this, classAttributeName, {
                    get: () => this.observable[classAttributeName],
                });
            }

            this.__init(this);
            this.__update(this, data);
        }

        /**
         * Should only be called from static `create` method, to avoid identity
         * crisis as proxified (and non-) class instances (from observable).
         *
         * @param {Object} [data]
         */
        constructor(data) {
            Object.defineProperty(this, 'env', {
                get: () => this.constructor.env,
            });
            this.localId = this._createInstanceLocalId(data);
            this.constructor.__init(this);
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @static
         * @returns {mail.messaging.entity.Entity[]} all instances of this entity
         */
        static get all() {
            const { state } = this.env.store;
            return Object.values(state.entities).filter(entity => entity instanceof this);
        }

        /**
         * Single way to create new entity instances in the store.
         *
         * @static
         * @param {Object} data data object with initial data, including relations.
         * @throws {Error} in case Entity class is a singleton and it creates
         *   more than one instance.
         * @returns {mail.messaging.entity.Entity} newly created entity
         */
        static create(data) {
            const { state } = this.env.store;
            if (this.isSingleton && this.all.length > 0) {
                throw new Error(`Singleton Entity class "${this.name}" cannot create more than one instance.`);
            }
            const entity = new this(data);
            state.entities[entity.localId] = entity;
            // ensure observable version of entity is handled.
            const proxifiedEntity = state.entities[entity.localId];
            this.__update(proxifiedEntity, data);
            return proxifiedEntity;
        }

        /**
         * @static
         */
        static delete() {
            for (const entity of this.all) {
                entity.delete();
            }
            this.__delete(this);
        }

        /**
         * @static
         * @param {any} id
         * @returns {mail.messaging.entity.Entity|undefined}
         */
        static fromId(id) {
            const allEntities = this.all;
            return allEntities.find(entity => entity.id === id);
        }

        /**
         * @static
         * @param {string|mail.messaging.entity.Entity|undefined} entityOrLocalId
         * @returns {mail.messaging.entity.Entity|undefined}
         */
        static get(entityOrLocalId) {
            const { state } = this.env.store;
            if (entityOrLocalId === undefined) {
                return undefined;
            }
            const entity = state.entities[
                entityOrLocalId.isEntity
                    ? entityOrLocalId.localId
                    : entityOrLocalId
            ];
            if (!(entity instanceof this) && entity !== this) {
                return;
            }
            return entity;
        }

        static link(data) {
            this.__link(this, data);
        }

        /**
         * @static
         * @param {Object} data
         * @param {any} data.id
         * @returns {mail.messaging.entity.Entity}
         */
        static insert(data) {
            let entity = this.fromId(data.id);
            if (!entity) {
                entity = this.create(data);
            } else {
                entity.update(data);
            }
            return entity;
        }

        /**
         * @throws {Error} when called with non singleton classes
         * @returns {mail.messaging.entity.Entity|undefined}
         */
        static get instance() {
            if (!this.isSingleton) {
                throw new Error(`Cannot get instance of non-singleton Entity class "${this.name}"`);
            }
            return this.all[0];
        }

        /**
         * @static
         * @returns {boolean}
         */
        static get isEntity() {
            return true;
        }

        /**
         * @static
         * @returns {boolean}
         */
        static get isEntityInstance() {
            return false;
        }

        /**
         * @static
         * @returns {boolean}
         */
        static get isEntityClass() {
            return true;
        }

        /**
         * @static
         * @param {Object|string} data
         */
        static unlink(data) {
            this.__unlink(this, data);
        }

        /**
         * @static
         * @param {Object} data
         */
        static update(data) {
            this.__update(this, data);
        }

        delete() {
            this.constructor.__delete(this);
        }

        /**
         * @returns {boolean}
         */
        get isEntity() {
            return true;
        }

        /**
         * @returns {boolean}
         */
        get isEntityClass() {
            return false;
        }

        /**
         * @returns {boolean}
         */
        get isEntityInstance() {
            return true;
        }

        /**
         * @param {Object} data
         */
        link(data) {
            this.constructor.__link(this, data);
        }

        /**
         * @param {Object} data
         */
        unlink(data) {
            this.constructor.__unlink(this, data);
        }

        /**
         * @param {Object} data
         */
        update(data) {
            this.constructor.__update(this, data);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @static
         * @private
         * @returns {string[]}
         */
        static _getListOfClassAttributeNames() {
            return [];
        }

        /**
         * @static
         * @private
         * @abstract
         * @param {Object} data
         */
        static _update(data) {}

        /**
         * Any assignment to class as attribute or stored relation should pass
         * through this function.
         *
         * @static
         * @private
         * @param {Object} data
         */
        static _write(data) {
            Object.assign(this.observable, data);
        }

        /**
         * @private
         * @param {Object} data
         * @returns {string}
         */
        _createInstanceLocalId(data) {
            return _.uniqueId(`${this.constructor.localId}_`);
        }

        /**
         * @abstract
         * @private
         * @param {Object} data
         */
        _update(data) {}

        /**
         * Any assignment to instance as attribute or stored relation should
         * pass through this function.
         *
         * @private
         * @param {Object} data
         */
        _write(data) {
            Object.assign(this, data);
        }

        //--------------------------------------------------------------------------
        // Internal
        //--------------------------------------------------------------------------

        /**
         * @static
         * @param {mail.messaging.entity.Entity} entity instance or class
         */
        static __delete(entity) {
            const { state } = this.env.store;
            if (!this.get(entity)) {
                // Entity has already been deleted.
                // (e.g. unlinking one of its reverse relation was causal)
                return;
            }
            const relations = entity.relations;
            const data = {};
            for (const relationName in relations) {
                const relation = relations[relationName];
                if (relation.isCausal) {
                    switch (relation.type) {
                        case 'one2one':
                        case 'many2one':
                            if (entity[relationName]) {
                                entity[relationName].delete();
                            }
                            break;
                        case 'one2many':
                        case 'many2many':
                            for (const relatedEntity of entity[relationName]) {
                                relatedEntity.delete();
                            }
                            break;
                    }
                }
                data[relationName] = null;
            }
            entity.unlink(data);
            delete state.entities[entity.localId];
            if (entity.isEntityClass) {
                delete state.__classEntityObservables[entity.localId];
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity instance or class
         */
        static __init(entity) {
            const relations = this.relations;
            for (const relationName in relations) {
                const relation = relations[relationName];
                if (['one2many', 'many2many'].includes(relation.type)) {
                    // Ensure X2many relations are arrays by defaults.
                    const storedRelationName = this.__getStoredRelationName(relationName);
                    entity._write({ [storedRelationName]: [] });
                }
                // compute getters
                Object.defineProperty(entity, relationName, {
                    get: () => {
                        const relation = relations[relationName];
                        const storedRelationName = this.__getStoredRelationName(relationName);
                        const RelatedEntity = this.env.entities[relation.to];
                        if (['one2one', 'many2one'].includes(relation.type)) {
                            return RelatedEntity.get(entity[storedRelationName]);
                        }
                        return entity[storedRelationName]
                            .map(localId => RelatedEntity.get(localId))
                            /**
                             * FIXME: Stored relation may still contain
                             * outdated entities.
                             */
                            .filter(entity => !!entity);
                    }
                });
            }
        }

        /**
         * @static
         * @private
         * @param {string} relationName
         * @returns {string}
         */
        static __getStoredRelationName(relationName) {
            return `${STORED_RELATION_PREFIX}${relationName}`;
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity class or entity
         * @param {Object} data
         */
        static __link(entity, data) {
            const relations = this.relations;
            for (const [relationName, relationValue] of Object.entries(data)) {
                const relation = relations[relationName];
                switch (relation.type) {
                    case 'one2one':
                        this.__linkSingleOne2One(entity, {
                            relationName,
                            relationValue,
                        });
                        break;
                    case 'one2many':
                        this.__linkSingleOne2Many(entity, {
                            relationName,
                            relationValue,
                        });
                        break;
                    case 'many2one':
                        this.__linkSingleMany2One(entity, {
                            relationName,
                            relationValue,
                        });
                        break;
                    case 'many2many':
                        this.__linkSingleMany2Many(entity, {
                            relationName,
                            relationValue,
                        });
                        break;
                }
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity
         * @param {Object} param1
         * @param {string} param1.relationName
         * @param {string|mail.messaging.entity.Entity|<mail.messaging.entity.Entity|string>[]} param1.relationValue
         */
        static __linkSingleMany2Many(entity, { relationName, relationValue }) {
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            const value = relationValue instanceof Array
                ? relationValue.map(e => e.isEntity ? e.localId: e)
                : [relationValue.isEntity ? relationValue.localId : relationValue];
            if (value.every(valueItem => prevValue.includes(valueItem))) {
                // Do not alter relations if unchanged.
                return;
            }
            entity._write({
                [storedRelationName]: [...new Set(entity[storedRelationName].concat(value))],
            });
            for (const valueItem of value) {
                if (prevValue.includes(valueItem)) {
                    continue;
                }
                const RelatedEntity = this.env.entities[relation.to];
                const related = RelatedEntity.get(valueItem);
                const storedRelatedRelationName =
                    RelatedEntity.__getStoredRelationName(relation.inverse);
                related._write({
                    [storedRelatedRelationName]: [
                        ...new Set(related[storedRelatedRelationName].concat([entity.localId]))
                    ],
                });
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity instance or class
         * @param {Object} param1
         * @param {string} param1.relationName
         * @param {string|mail.messaging.entity.Entity} param1.relationValue
         */
        static __linkSingleMany2One(entity, { relationName, relationValue }) {
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            const value = relationValue.isEntity ? relationValue.localId : relationValue;
            if (value === entity[storedRelationName]) {
                // Do not alter relations if unchanged.
                return;
            }
            entity._write({ [storedRelationName]: value });
            const RelatedEntity = this.env.entities[relation.to];
            if (prevValue) {
                const related = RelatedEntity.get(prevValue);
                if (!related) {
                    // prev Entity has already been deleted.
                    return;
                }
                const storedRelatedRelationName =
                    RelatedEntity.__getStoredRelationName(relation.inverse);
                related._write({
                    [storedRelatedRelationName]:
                        related[storedRelatedRelationName].filter(
                            valueItem => valueItem !== entity.localId
                        ),
                });
                if (relation.isCausal) {
                    related.delete();
                }
            }
            const related = RelatedEntity.get(value);
            const storedRelatedRelationName =
                RelatedEntity.__getStoredRelationName(relation.inverse);
            related._write({
                [storedRelatedRelationName]:
                    related[storedRelatedRelationName].concat([entity.localId]),
            });
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity instance or class
         * @param {Object} param1
         * @param {string} param1.relationName
         * @param {string|mail.messaging.entity.Entity|<string|mail.messaging.entity.Entity>[]} param1.relationValue
         */
        static __linkSingleOne2Many(entity, { relationName, relationValue }) {
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            const value = relationValue instanceof Array
                ? relationValue.map(e => e.isEntity ? e.localId: e)
                : [relationValue.isEntity ? relationValue.localId : relationValue];
            if (value.every(valueItem => prevValue.includes(valueItem))) {
                // Do not alter relations if unchanged.
                return;
            }
            entity._write({
                [storedRelationName]: [...new Set(entity[storedRelationName].concat(value))],
            });
            for (const valueItem of value) {
                if (prevValue.includes(valueItem)) {
                    continue;
                }
                const RelatedEntity = this.env.entities[relation.to];
                const related = RelatedEntity.get(valueItem);
                const storedRelatedRelationName =
                    RelatedEntity.__getStoredRelationName(relation.inverse);
                related._write({ [storedRelatedRelationName]: entity.localId });
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity instance or class
         * @param {Object} param1
         * @param {string} param1.relationName
         * @param {string|mail.messaging.entity.Entity} param1.relationValue
         */
        static __linkSingleOne2One(entity, { relationName, relationValue }) {
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            const value = relationValue.isEntity ? relationValue.localId : relationValue;
            entity._write({ [storedRelationName]: value });
            const RelatedEntity = this.env.entities[relation.to];
            if (prevValue) {
                const related = RelatedEntity.get(prevValue);
                const storedRelatedRelationName =
                    RelatedEntity.__getStoredRelationName(relation.inverse);
                related._write({ [storedRelatedRelationName]: undefined });
                if (relation.isCausal) {
                    related.delete();
                }
            }
            const related = RelatedEntity.get(value);
            const storedRelatedRelationName = RelatedEntity.__getStoredRelationName(relation.inverse);
            related._write({ [storedRelatedRelationName]: entity.localId });
        }

        /**
         * @static
         * @param {mail.messaging.entity.Entity} entity
         * @param {Object|string} data
         */
        static __unlink(entity, data) {
            if (!this.get(entity)) {
                // Entity has already been deleted.
                // (e.g. unlinking one of its reverse relation was causal)
                return;
            }
            const relations = this.relations;
            for (const [relationName, relationValue] of Object.entries(data)) {
                const relation = relations[relationName];
                switch (relation.type) {
                    case 'one2one':
                        this.__unlinkSingleOne2One(entity, { relationName });
                        break;
                    case 'one2many':
                        this.__unlinkSingleOne2Many(entity, { relationName, relationValue });
                        break;
                    case 'many2one':
                        this.__unlinkSingleMany2One(entity, { relationName });
                        break;
                    case 'many2many':
                        this.__unlinkSingleMany2Many(entity, { relationName, relationValue });
                        break;
                }
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity instance or class
         * @param {Object} param1
         * @param {string} param1.relationName
         * @param {string|mail.messaging.entity.Entity|<string|mail.messaging.entity.Entity>[]|null} param1.relationValue
         */
        static __unlinkSingleMany2Many(entity, { relationName, relationValue }) {
            if (!this.get(entity)) {
                // Entity has already been deleted.
                // (e.g. unlinking one of its reverse relation was causal)
                return;
            }
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const value = relationValue === null
                ? [...entity[storedRelationName]]
                : relationValue instanceof Array
                ? relationValue.map(e => e.isEntity ? e.localId: e)
                : [relationValue.isEntity ? relationValue.localId : relationValue];
            entity._write({
                [storedRelationName]: entity[storedRelationName].filter(
                    valueItem => !value.includes(valueItem)
                ),
            });
            const RelatedEntity = this.env.entities[relation.to];
            for (const valueItem of value) {
                const related = RelatedEntity.get(valueItem);
                const storedRelatedRelationName =
                    RelatedEntity.__getStoredRelationName(relation.inverse);
                related._write({
                    [storedRelatedRelationName]:
                        related[storedRelatedRelationName].filter(
                            valueItem => valueItem !== entity.localId
                        ),
                });
                if (relation.isCausal) {
                    related.delete();
                }
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity
         * @param {Object} param1
         * @param {string} param1.relationName
         */
        static __unlinkSingleMany2One(entity, { relationName }) {
            if (!this.get(entity)) {
                // Entity has already been deleted.
                // (e.g. unlinking one of its reverse relation was causal)
                return;
            }
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            if (prevValue) {
                const RelatedEntity = this.env.entities[relation.to];
                const prevEntity = RelatedEntity.get(prevValue);
                RelatedEntity.__unlinkSingleOne2Many(prevEntity, {
                    relationName: relation.inverse,
                    relationValue: entity.localId,
                });
            }
        }

        /**
         * @static
         * @private
         * @param {string|mail.messaging.entity.Entity} entity
         * @param {Object} param1
         * @param {string} param1.relationName
         * @param {string|mail.messaging.entity.Entity|<string|mail.messaging.entity.Entity>[]|null} param1.relationValue
         *   if null, unlink all items in the relation of provided entity.
         */
        static __unlinkSingleOne2Many(entity, { relationName, relationValue }) {
            if (!this.get(entity)) {
                // Entity has already been deleted.
                // (e.g. unlinking one of its reverse relation was causal)
                return;
            }
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            const value = relationValue === null
                ? [...entity[storedRelationName]]
                : relationValue instanceof Array
                ? relationValue.map(e => e.isEntity ? e.localId: e)
                : [relationValue.isEntity ? relationValue.localId : relationValue];
            entity._write({
                [storedRelationName]: entity[storedRelationName].filter(
                    valueItem => !value.includes(valueItem)
                ),
            });
            if (prevValue) {
                const RelatedEntity = this.env.entities[relation.to];
                for (const valueItem of value) {
                    const related = RelatedEntity.get(valueItem);
                    const storedRelatedRelationName =
                        RelatedEntity.__getStoredRelationName(relation.inverse);
                    related._write({
                        [storedRelatedRelationName]: undefined,
                    });
                    if (relation.isCausal) {
                        related.delete();
                    }
                }
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity instance or class
         * @param {Object} param1
         * @param {string} param1.relationName
         */
        static __unlinkSingleOne2One(entity, { relationName }) {
            if (!this.get(entity)) {
                // Entity has already been deleted.
                // (e.g. unlinking one of its reverse relation was causal)
                return;
            }
            const relation = this.relations[relationName];
            const storedRelationName = this.__getStoredRelationName(relationName);
            const prevValue = entity[storedRelationName];
            entity._write({ [storedRelationName]: undefined });
            const RelatedEntity = this.env.entities[relation.to];
            if (prevValue) {
                const related = RelatedEntity.get(prevValue);
                const storedRelatedRelationName =
                    RelatedEntity.__getStoredRelationName(relation.inverse);
                related._write({ [storedRelatedRelationName]: undefined });
            }
        }

        /**
         * @static
         * @private
         * @param {mail.messaging.entity.Entity} entity
         * @param {Object} [data={}]
         */
        static __update(entity, data = {}) {
            entity._update(data);
        }

    }

    Object.assign(Entity, {
        /**
         * Registry containing data to make Entity classes. Entity classes should
         * register themselves though static method `Entity.registerNewEntity()`.
         *
         * Format:
         *
         *   <relation-name>:
         *      {
         *         Factory: function that produce Entity class.
         *         plugins: list of extensions to apply on the Entity class.
         *                  Each entity classes should itself be designed to process
         *                  these plugins.
         *      }
         */
        registry: {},
        /**
         * Schema of relations for this entity.
         *
         * Format:
         *
         *   <relation-name>:
         *      {
         *         inverse: Name of inverse relation on related entity.
         *         isCausal: boolean that determines whether the related entities
         *                   are deeply connected to existence of current entity.
         *                   (default: false)
         *         to: Name of the related entity. Just for documentation sake.
         *         type: Type of the relation on this entity.
         *               Either 'one2one', 'one2many', 'many2one' or 'many2many'.
         *      }
         */
        relations: {
            /**
             * Related dialog of entity when dialog content is directly linked to
             * an entity that models a UI component, such as AttachmentViewer. Such
             * entities must be created from @see `Dialog.open()` and cannot be
             * singleton entities.
             */
            dialog: {
                inverse: 'entity',
                isCausal: true,
                to: 'Dialog',
                type: 'one2one',
            },
        },
    });

    return Entity;
}

registerNewEntity('Entity', EntityFactory);

});
