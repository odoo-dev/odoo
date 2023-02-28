/** @odoo-module **/

import { Patch } from '@mail/legacy/model';

Patch({
    name: 'NotificationGroupView',
    fields: {
        imageSrc: {
            compute() {
                if (this.notificationGroup.notification_type === 'snail') {
                    return '/snailmail/static/img/snailmail_failure.png';
                }
                return this._super();
            },
        },
    },
});
