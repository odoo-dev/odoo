odoo.define('snailmail.messaging.component.NotificationGroup', function (require) {
'use strict';

const components = {
    NotificationGroup: require('mail.messaging.component.NotificationGroup'),
};

const { patch } = require('web.utils');

patch(components.NotificationGroup, 'snailmail.messaging.component.NotificationGroup', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    image() {
        if (this.group.notification_type === 'snail') {
            return '/snailmail/static/img/snailmail_failure.png';
        }
        return this._super(...arguments);
    },
});

});
