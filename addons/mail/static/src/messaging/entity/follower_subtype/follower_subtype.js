odoo.define('mail.messaging.entity.FollowerSubtype', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entity.core');

function FollowerSubtypeFactory({ Entity }) {

    class FollowerSubtype extends Entity {

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         * @param {Object} data
         */
        _update(data) {
            const {
                default: isDefault,
                id,
                internal: isInternal,
                name,
                parent_model: parentModel,
                res_model: resModel,
                sequence,
            } = data;

            Object.assign(this, {
                id,
                isDefault,
                isInternal,
                name,
                parentModel,
                resModel,
                sequence,
            });
        }

    }

    return FollowerSubtype;
}

registerNewEntity('FollowerSubtype', FollowerSubtypeFactory);

});
