/** @odoo-module alias=mail.components.NotificationAlert **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class NotificationAlert extends usingModels(Component) {

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
        const windowNotification = this.env.browser.Notification;
        return (
            windowNotification &&
            windowNotification.permission !== 'granted' &&
            !this.env.services.action.dispatch('Messaging/isNotificationPermissionDefault')
        );
    }

}

Object.assign(NotificationAlert, {
    props: {},
    template: 'mail.NotificationAlert',
});

export default NotificationAlert;
