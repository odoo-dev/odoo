odoo.define('mail_bot.messaging.component.NotificationAlert', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class NotificationAlert extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const isMessagingInitialized = this.env.isMessagingInitialized();
            let mailbot = isMessagingInitialized
                ? this.env.entities.Mailbot.instance
                : undefined;
            return {
                isMessagingInitialized,
                mailbot,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {boolean}
     */
    get isNotificationBlocked() {
        if (!this.env.isMessagingInitialized()) {
            return false;
        }
        const mailbot = this.env.entities.Mailbot.instance;
        return (
            window.Notification &&
            window.Notification.permission !== "granted" &&
            !mailbot.hasRequest()
        );
    }

}

Object.assign(NotificationAlert, {
    props: {},
    template: 'mail_bot.messaging.component.NotificationAlert',
});

return NotificationAlert;

});
