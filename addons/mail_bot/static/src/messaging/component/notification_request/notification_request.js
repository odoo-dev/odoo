odoo.define('mail_bot.component.NotificationRequest', function (require) {
'use strict';

const PartnerImStatusIcon = require('mail.component.PartnerImStatusIcon');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class NotificationRequest extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                isMobile: state.isMobile,
                partnerRoot: state.partners[state.partnerRootLocalId],
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
        return _.str.sprintf(this.env._t("%s has a request"),
            this.storeGetters.partnerName(this.storeProps.partnerRoot.localId)
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
        this.storeDispatch('removeOdoobotRequest');
        if (value !== 'granted') {
            this.env.call('bus_service',
                'sendNotification',
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
    components: {
        PartnerImStatusIcon,
    },
    props: {},
    template: 'mail_bot.component.NotificationRequest',
});

return NotificationRequest;

});
