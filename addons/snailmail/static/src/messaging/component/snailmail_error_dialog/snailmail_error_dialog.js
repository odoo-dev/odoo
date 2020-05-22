odoo.define('snailmail.messaging.component.SnailmailErrorDialog', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const Dialog = require('web.OwlDialog');

const { Component } = owl;
const { useRef } = owl.hooks;

class SnailmailErrorDialog extends Component {

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
                snailmail_credits_url: this.env.messaging.snailmail_credits_url,
                snailmail_credits_url_trial: this.env.messaging.snailmail_credits_url_trial,
            };
        }, {
            compareDepth: {
                notifications: 1,
            },
        });
        // to manually trigger the dialog close event
        this._dialogRef = useRef('dialog');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {boolean}
     */
    get hasCreditsError() {
        return (
            this.notification.failure_type === 'sn_credit' ||
            this.notification.failure_type === 'sn_trial'
        );
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

    /**
     * @returns {string}
     */
    get title() {
        return this.env._t("Failed letter");
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickCancelLetter() {
        this._dialogRef.comp._close();
        this.message.cancelLetter();
    }

    /**
     * @private
     */
    _onClickClose() {
        this._dialogRef.comp._close();
    }

    /**
     * @private
     */
    _onClickResendLetter() {
        this._dialogRef.comp._close();
        this.message.resendLetter();
    }

}

Object.assign(SnailmailErrorDialog, {
    components: { Dialog },
    props: {
        messageLocalId: String,
    },
    template: 'snailmail.messaging.component.SnailmailErrorDialog',
});

return SnailmailErrorDialog;

});
