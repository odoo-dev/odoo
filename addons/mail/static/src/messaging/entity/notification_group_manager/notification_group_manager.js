odoo.define('mail.messaging.entity.NotificationGroupManager', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { one2many } = require('mail.messaging.EntityField');

function NotificationGroupManagerFactory({ Entity }) {

    class NotificationGroupManager extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        computeGroups() {
            for (const group of this.groups) {
                group.delete();
            }
            const groups = [];
            this.env.messaging.currentPartner.failureNotifications.forEach(notification => {
                const thread = notification.message.originThread;
                // Notifications are grouped by model and notification_type.
                // Except for channel where they are also grouped by id because
                // we want to open the actual channel in discuss or chat window
                // and not its kanban/list/form view.
                const channelId = thread.model === 'mail.channel' ? thread.id : null;
                const id = `${thread.model}/${channelId}/${notification.notification_type}`;
                const group = this.env.entities.NotificationGroup.insert({
                    id,
                    notification_type: notification.notification_type,
                    res_model: thread.model,
                    res_model_name: thread.model_name,
                });
                group.update({ notifications: [['link', notification]] });
                // keep res_id only if all notifications are for the same record
                // set null if multiple records are present in the group
                let res_id = group.res_id;
                if (group.res_id === undefined) {
                    res_id = thread.id;
                } else if (group.res_id !== thread.id) {
                    res_id = null;
                }
                // keep only the most recent date from all notification messages
                let date = group.date;
                if (!date) {
                    date = notification.message.date;
                } else {
                    date = moment.max(group.date, notification.message.date);
                }
                group.update({
                    date,
                    res_id,
                });
                groups.push(group);
            });
            this.update({ groups: [['link', groups]] });
        }

    }

    NotificationGroupManager.entityName = 'NotificationGroupManager';

    NotificationGroupManager.fields = {
        groups: one2many('NotificationGroup'),
    };

    return NotificationGroupManager;
}

registerNewEntity('NotificationGroupManager', NotificationGroupManagerFactory);

});
