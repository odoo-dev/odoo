odoo.define('mail.messaging.entity.Entity', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { EntityDeletedError } = require('mail.messaging.entityErrors');

function EntityFactory() {

    class Entity {

        /**
         * @param {Object} [param0={}]
         * @param {boolean} [param0.valid=false] if set, this constructor is
         *   called by static method `create()`. This should always be the case.
         * @throws {Error} in case constructor is called in an invalid way, i.e.
         *   by instantiating the entity manually with `new` instead of from
         *   static method `create()`.
         */
        constructor({ valid = false } = {}) {
            if (!valid) {
                throw new Error("Entity must always be instantiated from static method 'create()'");
            }
        }

        /**
         * Called when the entity is being created, but not yet processed
         * its create value on the fields. This method is handy to define purely
         * technical property on this entity, like handling of timers. This
         * method acts like the constructor, but has a very important difference:
         * the `this` is the proxified entity, so evaluation of field values
         * on get/set work correctly.
         */
        init() {}

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * Returns all instance entities of this entity class that match
         * provided criteria.
         *
         * @static
         * @param {function} [filterFunc]
         * @returns {mail.messaging.entity.Entity[]}
         */
        static all(filterFunc) {
            return this.env.entityManager.all(this, filterFunc);
        }

        /**
         * This method is used to create new entity instances of this class
         * with provided data. This is the only way to create them:
         * instantiation must never been done with keyword `new` outside of this
         * function, otherwise the instance entity will not be registered.
         *
         * @static
         * @param {Object} [data] data object with initial data, including relations.
         * @returns {mail.messaging.entity.Entity} newly created entity
         */
        static create(data) {
            return this.env.entityManager.create(this, data);
        }

        /**
         * Get the instance entity that has provided criteria, if it exists.
         *
         * @static
         * @param {function} findFunc
         * @returns {mail.messaging.entity.Entity|undefined}
         */
        static find(findFunc) {
            return this.env.entityManager.find(this, findFunc);
        }

        /**
         * This method returns the entity of this class that matches provided
         * local id. Useful to convert a local id to an entity. Note that even
         * if there's a entity in the system having provided local id, if the
         * resulting entity is not an instance of this class, this getter
         * assumes the entity does not exist.
         *
         * @static
         * @param {string|mail.messaging.entity.Entity|undefined} entityOrLocalId
         * @returns {mail.messaging.entity.Entity|undefined}
         */
        static get(entityOrLocalId) {
            return this.env.entityManager.get(this, entityOrLocalId);
        }

        /**
         * This method creates an instance entity or updates one, depending
         * on provided data.
         *
         * @static
         * @param {Object} data
         * @returns {mail.messaging.entity.Entity} created or updated entity.
         */
        static insert(data) {
            return this.env.entityManager.insert(this, data);
        }

        /**
         * Perform an async function and wait until it is done. If the entity
         * is deleted, it raises an EntityDeletedError.
         *
         * @param {function} func an async function
         * @throws {EntityDeletedError} in case the current entity is not alive
         *   at the end of async function call, whether it's resolved or
         *   rejected.
         * @throws {any} forwards any error in case the current entity is still
         *   alive at the end of rejected async function call.
         * @returns {any} result of resolved async function.
         */
        async async(func) {
            return new Promise((resolve, reject) => {
                func().then(result => {
                    if (this.constructor.get(this)) {
                        resolve(result);
                    } else {
                        reject(new EntityDeletedError(this.localId));
                    }
                }).catch(error => {
                    if (this.constructor.get(this)) {
                        reject(error);
                    } else {
                        reject(new EntityDeletedError(this.localId));
                    }
                });
            });
        }

        /**
         * This method deletes this instance entity.
         */
        delete() {
            this.env.entityManager.delete(this);
        }

        /**
         * Update this instance entity with provided data.
         *
         * @param {Object} [data={}]
         */
        update(data = {}) {
            this.env.entityManager.update(this, data);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @static
         * @private
         * @param {Object} data
         * @param {any} data.id
         * @return {function}
         */
        static _findFunctionFromData(data) {
            return entity => entity.id === data.id;
        }

        /**
         * This method generates a local id for this instance entity that is
         * being created at the moment.
         *
         * This function helps customizing the local id to ease mapping a local
         * id to its entity for the developer that reads the local id. For
         * instance, the local id of a thread cache could combine the thread
         * and stringified domain in its local id, which is much easier to
         * track relations and entities in the system instead of arbitrary
         * number to differenciate them.
         *
         * @private
         * @param {Object} data
         * @returns {string}
         */
        _createInstanceLocalId(data) {
            return _.uniqueId(`${this.constructor.entityName}_`);
        }

        /**
         * This function is called when this entity has been explicitly updated
         * with `.update()` or static method `.create()`, at the end of an
         * entity update cycle. This is a backward-compatible behaviour that
         * is deprecated: you should use computed fields instead.
         *
         * @deprecated
         * @abstract
         * @private
         * @param {Object} previous contains data that have been stored by
         *   `_updateBefore()`. Useful to make extra update decisions based on
         *   previous data.
         */
        _updateAfter(previous) {}

        /**
         * This function is called just at the beginning of an explicit update
         * on this function, with `.update()` or static method `.create()`. This
         * is useful to remember previous values of fields in `_updateAfter`.
         * This is a backward-compatible behaviour that is deprecated: you
         * should use computed fields instead.
         *
         * @deprecated
         * @abstract
         * @private
         * @param {Object} data
         * @returns {Object}
         */
        _updateBefore() {
            return {};
        }

    }

    /**
     * Name of the entity class. Important to refer to appropriate entity class
     * like in relational fields. Name of entity classes must be unique.
     */
    Entity.entityName = 'Entity';
    /**
     * Entity classes should define fields in static prop or getter `field`.
     * It contains an object with name of field as key and value are objects
     * that define the field. There are some helpers to ease the making of these
     * objects, @see `mail.messaging.entityCore:fields`
     *
     * Note: fields of super-class are automatically inherited, therefore a
     * sub-class should (re-)define fields without copying ancestors' fields.
     */
    Entity.fields = {};

    return Entity;
}

registerNewEntity('Entity', EntityFactory);

});
