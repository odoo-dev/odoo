odoo.define('mail_bot.messaging.component.NotificationList', function (require) {
'use strict';

const components = {
    mail: {
        NotificationList: require('mail.messaging.component.NotificationList'),
    },
    mail_bot: {
        NotificationRequest: require('mail_bot.messaging.component.NotificationRequest'),
    },
};

// ensure the store is patched before patching the component
require('mail_bot.MailBotService');

const { patch } = require('web.utils');

Object.assign(components.mail.NotificationList.components, components.mail_bot);

patch(components.mail.NotificationList, 'mail_bot.messaging.component.NotificationList', {
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
    _useStoreSelector(state, props) {
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
