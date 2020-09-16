/** @odoo-module alias=snailmail.components.SnailmailErrorDialog **/

import usingModels from 'mail.componentMixins.usingModels';

import Dialog from 'web.OwlDialog';

const { Component } = owl;
const { useRef } = owl.hooks;

class SnailmailErrorDialog extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
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
            this.notification.$$$failureType(this) === 'sn_credit' ||
            this.notification.$$$failureType(this) === 'sn_trial'
        );
    }

    /**
     * @returns {Notification}
     */
    get notification() {
        // Messages from snailmail are considered to have at most one notification.
        return this.message.$$$notifications(this)[0];
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
        this.env.services.action.dispatch('Message/cancelLetter', this.message);
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
        this.env.services.action.dispatch('Message/resendLetter', this.message);
    }

}

Object.assign(SnailmailErrorDialog, {
    components: { Dialog },
    props: {
        message: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Message') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'snailmail.SnailmailErrorDialog',
});

export default SnailmailErrorDialog;
