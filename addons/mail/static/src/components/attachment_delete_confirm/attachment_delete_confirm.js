/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';
import { escape } from '@web/core/utils/strings';

import Dialog from 'web.OwlDialog';

const { Component } = owl;

export class AttachmentDeleteConfirm extends Component {

    /**
     * @override
     */
    setup() {
        this.dialogAPI = {}
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Attachment}
     */
    get attachment() {
        return this.messaging && this.messaging.models['Attachment'].get(this.props.attachmentLocalId);
    }

    /**
     * @returns {string}
     */
    getBody() {
        return _.str.sprintf(
            this.env._t(`Do you really want to delete "%s"?`),
            escape(this.attachment.displayName)
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
        this.dialogAPI.close();
    }

    /**
     * @private
     */
    async _onClickOk() {
        await this.attachment.remove();
        this.dialogAPI.close();
        if (this.props.onAttachmentRemoved) {
            this.props.onAttachmentRemoved({
                attachmentLocalId: this.props.attachmentLocalId,
            });
        }
    }

}

Object.assign(AttachmentDeleteConfirm, {
    components: { Dialog },
    props: {
        attachmentLocalId: String,
        onAttachmentRemoved: {
            type: Function,
            optional: true,
        },
        onClosed: {
            type: Function,
            optional: true,
        }
    },
    template: 'mail.AttachmentDeleteConfirm',
});

registerMessagingComponent(AttachmentDeleteConfirm);
