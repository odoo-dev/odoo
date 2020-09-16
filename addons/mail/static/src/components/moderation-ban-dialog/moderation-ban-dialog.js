/** @odoo-module alias=mail.components.ModerationBanDialog **/

import usingModels from 'mail.componentMixins.usingModels';

import Dialog from 'web.OwlDialog';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class ModerationBanDialog extends usingModels(Component) {

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
     * @returns {string}
     */
    get CONFIRMATION() {
        return this.env._t("Confirmation");
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickBan() {
        this._dialogRef.comp._close();
        this.env.services.action.dispatch('Message/moderateMessages', this.messages, 'ban');
    }

    /**
     * @private
     */
    _onClickCancel() {
        this._dialogRef.comp._close();
    }

}

Object.assign(ModerationBanDialog, {
    components: { Dialog },
    props: {
        messages: {
            type: Array,
            element: Object,
            validate(p) {
                for (const i of p) {
                    if (i.constructor.modelName !== 'Message') {
                        return false;
                    }
                }
                return true;
            },
        },
    },
    template: 'mail.ModerationBanDialog',
});

QWeb.registerComponent('ModerationBanDialog', ModerationBanDialog);

export default ModerationBanDialog;
