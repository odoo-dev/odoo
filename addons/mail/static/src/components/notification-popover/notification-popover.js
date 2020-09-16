/** @odoo-module alias=mail.components.NotificationPopover **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class NotificationPopover extends usingModels(Component) {

    /**
     * @returns {string}
     */
    get iconClass() {
        switch (this.notification.$$$status(this)) {
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
        switch (this.notification.$$$status(this)) {
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

}

Object.assign(NotificationPopover, {
    props: {
        notifications: {
            type: Array,
            element: Object,
            validate(p) {
                for (const i of p) {
                    if (i.constructor.modelName !== 'Notification') {
                        return false;
                    }
                }
                return true;
            },
        },
    },
    template: 'mail.NotificationPopover',
});

export default NotificationPopover;
