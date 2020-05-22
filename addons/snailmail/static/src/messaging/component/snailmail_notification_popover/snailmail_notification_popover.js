odoo.define('snailmail.messaging.component.SnailmailNotificationPopover', function (require) {
'use strict';

const { Component } = owl;
const useStore = require('mail.messaging.component_hook.useStore');

class SnailmailNotificationPopover extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const message = this.env.entities.Message.get(props.messageLocalId);
            const notifications = message ? message.notifications : [];
            return {
                message: message ? message.__state : undefined,
                notifications: notifications.map(notification => notification ? notification.__state : undefined),
            };
        }, {
            compareDepth: {
                notifications: 1,
            },
        });
    }

    /**
     * @returns {string}
     */
    get iconClass() {
        switch (this.notification.notification_status) {
            case 'sent':
                return 'fa fa-check';
            case 'ready':
                return 'fa fa-clock-o';
            case 'canceled':
                return 'fa fa-trash-o';
            default:
                return 'fa fa-exclamation text-danger';
        }
    }

    /**
     * @returns {string}
     */
    get iconTitle() {
        switch (this.notification.notification_status) {
            case 'sent':
                return this.env._t("Sent");
            case 'ready':
                return this.env._t("Awaiting Dispatch");
            case 'canceled':
                return this.env._t("Canceled");
            default:
                return this.env._t("Error");
        }
    }

    /**
     * @returns {mail.messaging.entity.Message}
     */
    get message() {
        return this.env.entities.Message.get(this.props.messageLocalId);
    }

    /**
     * @returns {mail.messaging.entity.Notification}
     */
    get notification() {
        // Messages from snailmail are considered to have at most one notification.
        return this.message.notifications[0];
    }

}

Object.assign(SnailmailNotificationPopover, {
    props: {
        messageLocalId: String,
    },
    template: 'snailmail.messaging.component.SnailmailNotificationPopover',
});

return SnailmailNotificationPopover;

});
