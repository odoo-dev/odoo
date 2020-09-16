/** @odoo-module alias=mail.components.NotificationRequest **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class NotificationRequest extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    getHeaderText() {
        return _.str.sprintf(
            this.env._t("%s has a request"),
            this.env.services.model.messaging.$$$partnerRoot(this).$$$nameOrDisplayName(this),
        );
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Handle the response of the user when prompted whether push notifications
     * are granted or denied.
     *
     * @private
     * @param {string} value
     */
    _handleResponseNotificationPermission(value) {
        // manually force recompute because the permission is not in the store
        this.env.services.action.dispatch(
            'Record/update',
            this.env.services.model.messaging.$$$messagingMenu(this),
        );
        if (value !== 'granted') {
            this.env.services['bus_service'].sendNotification({
                message: this.env._t("Odoo will not have the permission to send native notifications on this device."),
                title: this.env._t("Permission denied"),
            });
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClick() {
        const windowNotification = this.env.browser.Notification;
        const def = windowNotification && windowNotification.requestPermission();
        if (def) {
            def.then(this._handleResponseNotificationPermission.bind(this));
        }
        if (!this.env.services.model.messaging.$$$device(this).$$$isMobile(this)) {
            this.env.services.action.dispatch('MessagingMenu/close',
                this.env.services.model.messaging.$$$messagingMenu(this),
            );
        }
    }

}

Object.assign(NotificationRequest, {
    props: {},
    template: 'mail.NotificationRequest',
});

QWeb.registerComponent('NotificationRequest', NotificationRequest);

export default NotificationRequest;
