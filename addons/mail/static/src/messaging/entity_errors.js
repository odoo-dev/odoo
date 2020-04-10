odoo.define('mail.messaging.entityErrors', function (require) {
'use strict';

class EntityDeletedError extends Error {

    /**
     * @override
     * @param {string} entityLocalId local id of entity that has been deleted
     * @param  {...any} args
     */
    constructor(entityLocalId, ...args) {
        super(...args);
        this.entityLocalId = entityLocalId;
        this.name = 'EntityDeletedError';
    }
}

return {
    EntityDeletedError,
};

});
