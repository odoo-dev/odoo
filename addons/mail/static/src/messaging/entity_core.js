odoo.define('mail.messaging.entityCore', function (require) {
'use strict';

/**
 * Module that contains registry for adding new entities or patching entities.
 * Useful for entity manager in order to generate entity classes.
 *
 * This code is not in entity manager because other JS modules should populate
 * a registry, and it's difficult to ensure availability of the entity manager
 * when these JS modules are deployed.
 */

const registry = {};

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

/**
 * @private
 * @param {string} entityName
 * @returns {Object}
 */
function _getEntryFromEntityName(entityName) {
    if (!registry[entityName]) {
        registry[entityName] = {
            dependencies: [],
            factory: undefined,
            name: entityName,
            patches: [],
        };
    }
    return registry[entityName];
}

/**
 * @private
 * @param {string} entityName
 * @param {string} patchName
 * @param {Object} patch
 * @param {Object} [param3={}]
 * @param {string} [param3.type='instance'] 'instance', 'class' or 'field'
 */
function _registerPatchEntity(entityName, patchName, patch, { type = 'instance' } = {}) {
    const entry = _getEntryFromEntityName(entityName);
    Object.assign(entry, {
        patches: (entry.patches || []).concat([{
            name: patchName,
            patch,
            type,
        }]),
    });
}

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

/**
 * Register a patch for static methods in entity.
 *
 * @param {string} entityName
 * @param {string} patchName
 * @param {Object} patch
 */
function registerClassPatchEntity(entityName, patchName, patch) {
    _registerPatchEntity(entityName, patchName, patch, { type: 'class' });
}

/**
 * Register a patch for fields in entity.
 *
 * @param {string} entityName
 * @param {string} patchName
 * @param {Object} patch
 */
function registerFieldPatchEntity(entityName, patchName, patch) {
    _registerPatchEntity(entityName, patchName, patch, { type: 'field' });
}

/**
 * Register a patch for instance methods in entity.
 *
 * @param {string} entityName
 * @param {string} patchName
 * @param {Object} patch
 */
function registerInstancePatchEntity(entityName, patchName, patch) {
    _registerPatchEntity(entityName, patchName, patch, { type: 'instance' });
}

/**
 * @param {string} name
 * @param {function} factory
 * @param {string[]} [dependencies=[]]
 */
function registerNewEntity(name, factory, dependencies = []) {
    const entry = _getEntryFromEntityName(name);
    let entryDependencies = [...dependencies];
    if (name !== 'Entity') {
        entryDependencies = [...new Set(entryDependencies.concat(['Entity']))];
    }
    if (entry.factory) {
        throw new Error(`Entity class "${name}" has already been registered!`);
    }
    Object.assign(entry, {
        dependencies: entryDependencies,
        factory,
        name,
    });
}

//------------------------------------------------------------------------------
// Export
//------------------------------------------------------------------------------

return {
    registerClassPatchEntity,
    registerFieldPatchEntity,
    registerInstancePatchEntity,
    registerNewEntity,
    registry,
};

});
