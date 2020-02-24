odoo.define('mail_bot.component.NotificationList', function (require) {
'use strict';

const NotificationList = require('mail.component.NotificationList');

const NotificationRequest = require('mail_bot.component.NotificationRequest');

// ensure the store is patched before patching the component
require('mail_bot.MailBotService');

const { patch } = require('web.utils');

NotificationList.components.NotificationRequest = NotificationRequest;

patch(NotificationList, 'mail_bot_notification_list', {
    /**
     * @override
     */
    mounted() {
        this._super(...arguments);
        this._checkOdooBotRequest();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * To catch updates of 'OdooBot has a request' if the Notification
     * permission was changed from the browser, outside of the request flow,
     * because it is not possible to register an event on it.
     *
     * This is not ideal because a render must happen from another reason for
     * the update here to take effect (such as closing and opening the
     * notification list again), but it is better than nothing.
     *
     * @private
     */
    _checkOdooBotRequest() {
        this.storeDispatch('checkOdoobotRequest');
    },
    /**
     * Override so that 'OdooBot has a request' is included in the list.
     *
     * @override
     */
    _useStore(state, props) {
        const res = this._super(...arguments);
        if (props.filter === 'all' && state.mailbotHasRequest) {
            res.notifications.unshift({
                type: 'odoobotRequest',
                uniqueId: `odoobotRequest`,
            });
        }
        return res;
    }
});

});
