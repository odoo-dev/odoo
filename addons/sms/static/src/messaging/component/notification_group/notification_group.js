odoo.define('sms.messaging.component.NotificationGroup', function (require) {
'use strict';

const components = {
    NotificationGroup: require('mail.messaging.component.NotificationGroup'),
};

const { patch } = require('web.utils');

patch(components.NotificationGroup, 'sms.messaging.component.NotificationGroup', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    image() {
        if (this.group.notification_type === 'sms') {
            return '/sms/static/img/sms_failure.svg';
        }
        return this._super(...arguments);
    },
});

});
