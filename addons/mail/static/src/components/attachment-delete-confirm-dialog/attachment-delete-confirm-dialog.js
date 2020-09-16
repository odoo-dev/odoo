/** @odoo-module alias=mail.components.AttachmentDeleteConfirmDialog **/

import usingModels from 'mail.componentMixins.usingModels';

import Dialog from 'web.OwlDialog';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class AttachmentDeleteConfirmDialog extends usingModels(Component) {

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
    getBody() {
        return _.str.sprintf(
            this.env._t(`Do you really want to delete "%s"?`),
            owl.utils.escape(this.attachment.displayName(this)),
        );
    }

    /**
     * @returns {string}
     */
    getTitle() {
        return this.env._t("Confirmation");
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickCancel() {
        this._dialogRef.comp._close();
    }

    /**
     * @private
     */
    _onClickOk() {
        this._dialogRef.comp._close();
        this.env.services.action.dispatch(
            'Attachment/remove',
            this.attachment,
        );
        this.trigger(
            'o-attachment-removed',
            { attachment: this.attachment },
        );
    }

}

Object.assign(AttachmentDeleteConfirmDialog, {
    components: { Dialog },
    props: {
        attachment: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Attachment') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.AttachmentDeleteConfirmDialog',
});

QWeb.registerComponent('AttachmentDeleteConfirmDialog', AttachmentDeleteConfirmDialog);

export default AttachmentDeleteConfirmDialog;
