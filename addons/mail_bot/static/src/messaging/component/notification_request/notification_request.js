odoo.define('mail_bot.messaging.component.NotificationRequest', function (require) {
'use strict';

const components = {
    PartnerImStatusIcon: require('mail.messaging.component.PartnerImStatusIcon'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;

class NotificationRequest extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            return {
                isDeviceMobile: this.env.entities.Device.instance.isMobile,
                partnerRoot: this.env.entities.Partner.root,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    getHeaderText() {
        return _.str.sprintf(
            this.env._t("%s has a request"),
            this.env.entities.Partner.root.nameOrDisplayName
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
        this.env.entities.Mailbot.instance.update();
        if (value !== 'granted') {
            this.env.call('bus_service', 'sendNotification',
                this.env._t("Permission denied"),
                this.env._t("Odoo will not have the permission to send native notifications on this device.")
            );
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClick() {
        const def = window.Notification && window.Notification.requestPermission();
        if (def) {
            def.then(this._handleResponseNotificationPermission.bind(this));
        }
        this.trigger('o-odoobot-request-clicked');
    }

}

Object.assign(NotificationRequest, {
    components,
    props: {},
    template: 'mail_bot.messaging.component.NotificationRequest',
});

return NotificationRequest;

});
