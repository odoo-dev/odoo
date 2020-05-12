odoo.define('mail.messaging.entityErrors', function (require) {
'use strict';

class EntityDeletedError extends Error {}

return {
    EntityDeletedError,
};

});
