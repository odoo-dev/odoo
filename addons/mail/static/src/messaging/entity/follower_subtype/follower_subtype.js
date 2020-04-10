odoo.define('mail.messaging.entity.FollowerSubtype', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr } = require('mail.messaging.EntityField');

function FollowerSubtypeFactory({ Entity }) {

    class FollowerSubtype extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @param {Object} data
         * @returns {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('default' in data) {
                data2.isDefault = data.default;
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('internal' in data) {
                data2.isInternal = data.internal;
            }
            if ('name' in data) {
                data2.name = data.name;
            }
            if ('parent_model' in data) {
                data2.parentModel = data.parent_model;
            }
            if ('res_model' in data) {
                data2.resModel = data.res_model;
            }
            if ('sequence' in data) {
                data2.sequence = data.sequence;
            }
            return data2;
        }

    }

    FollowerSubtype.entityName = 'FollowerSubtype';

    FollowerSubtype.fields = {
        id: attr(),
        isDefault: attr({
            default: false,
        }),
        isInternal: attr({
            default: false,
        }),
        name: attr(),
        // AKU FIXME: use relation instead
        parentModel: attr(),
        // AKU FIXME: use relation instead
        resModel: attr(),
        sequence: attr(),
    };

    return FollowerSubtype;
}

registerNewEntity('FollowerSubtype', FollowerSubtypeFactory);

});
