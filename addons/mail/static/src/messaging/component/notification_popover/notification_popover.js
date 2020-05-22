odoo.define('mail.messaging.component.NotificationPopover', function (require) {
'use strict';

const { Component } = owl;
const useStore = require('mail.messaging.component_hook.useStore');

class NotificationPopover extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const notifications = props.notificationLocalIds.map(
                notificationLocalId => this.env.entities.Notification.get(notificationLocalId)
            );
            return {
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
            case 'bounce':
                return 'fa fa-exclamation';
            case 'exception':
                return 'fa fa-exclamation';
            case 'ready':
                return 'fa fa-send-o';
            case 'canceled':
                return 'fa fa-trash-o';
        }
        return '';
    }

    /**
     * @returns {string}
     */
    get iconTitle() {
        switch (this.notification.notification_status) {
            case 'sent':
                return this.env._t("Sent");
            case 'bounce':
                return this.env._t("Bounced");
            case 'exception':
                return this.env._t("Error");
            case 'ready':
                return this.env._t("Ready");
            case 'canceled':
                return this.env._t("Canceled");
        }
        return '';
    }

    /**
     * @returns {mail.messaging.entity.Notification[]}
     */
    get notifications() {
        return this.props.notificationLocalIds.map(
            notificationLocalId => this.env.entities.Notification.get(notificationLocalId)
        );
    }

}

Object.assign(NotificationPopover, {
    props: {
        notificationLocalIds: {
            type: Array,
            element: String,
        },
    },
    template: 'mail.messaging.component.NotificationPopover',
});

return NotificationPopover;

});
