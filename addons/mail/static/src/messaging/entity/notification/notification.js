odoo.define('mail.messaging.entity.Notification', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2one } = require('mail.messaging.EntityField');

function NotificationFactory({ Entity }) {

    class Notification extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @param {Object} data
         * @return {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('failure_type' in data) {
                data2.failure_type = data.failure_type;
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('notification_status' in data) {
                data2.notification_status = data.notification_status;
            }
            if ('notification_type' in data) {
                data2.notification_type = data.notification_type;
            }
            if ('partner_id' in data) {
                if (!data.partner_id) {
                    data2.partner = [['unlink-all']];
                } else {
                    data2.partner = [
                        ['insert', {
                            display_name: data.partner_id[1],
                            id: data.partner_id[0],
                        }],
                    ];
                }
            }
            return data2;
        }

    }

    Notification.entityName = 'Notification';

    Notification.fields = {
        failure_type: attr(),
        id: attr(),
        message: many2one('Message', {
            inverse: 'notifications',
        }),
        notification_status: attr(),
        notification_type: attr(),
        partner: many2one('Partner'),
    };

    return Notification;
}

registerNewEntity('Notification', NotificationFactory);

});
