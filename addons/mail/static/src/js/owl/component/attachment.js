odoo.define('mail.component.Attachment', function () {
'use strict';

class Attachment extends owl.store.ConnectedComponent {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get attachmentUrl() {
        if (this.storeProps.attachment.isTemporary) {
            return '';
        }
        return this.env.session.url('/web/content', {
            id: this.storeProps.attachment.id,
            download: true,
        });
    }

    /**
     * Get the details mode after auto mode is computed
     * @return {string} 'card', 'hover' or 'none'
     */
    get detailsMode() {
        if (this.props.detailsMode !== 'auto') {
            return this.props.detailsMode;
        }
        return this.env.store.getters.attachmentFileType(this.props.attachmentLocalId) !== 'image' ? 'card' : 'hover';
    }

    /**
     * Get the attachment representation style to be applied
     * @return {string}
     */
    get reprStyle() {
        if (this.env.store.getters.attachmentFileType(this.props.attachmentLocalId) !== 'image') {
            return '';
        } else {
            let size = '160x160';
            if (this.detailsMode === 'card') {
                size = '38x38';
            }
            return `background-image:url(/web/image/${this.storeProps.attachment.id}/${size}/?crop=true);`;
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDownload(ev) {
        window.location = `/web/content/ir.attachment/${this.storeProps.attachment.id}/datas?download=true`;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickImage(ev) {
        if (
            !this.props.allowPreview ||
            !this.env.store.getters.isAttachmentViewable(this.props.attachmentLocalId)
        ) {
            return;
        }
        this.dispatch('viewAttachments', {
            attachmentLocalId: this.props.attachmentLocalId,
            attachmentLocalIds: this.props.attachmentLocalIds.filter(localId =>
                this.env.store.getters.isAttachmentViewable(localId)),
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickUnlink(ev) {
        this.dispatch('unlinkAttachment', this.props.attachmentLocalId);
    }
}

Attachment.defaultProps = {
    allowPreview: true,
    detailsMode: 'auto',
    isDownloadable: false,
    isEditable: true,
    showExtensionInDetails: true,
    showFilenameInDetails: true,
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.attachmentLocalId
 */
Attachment.mapStoreToProps = function (state, ownProps) {
    return {
        attachment: state.attachments[ownProps.attachmentLocalId],
    };
};

Attachment.props = {
    allowPreview: Boolean,
    attachment: Object, // {mail.store.model.Attachment}
    attachmentLocalId: String,
    detailsMode: String, // ['auto', 'card', 'hover', 'none']
    isDownloadable: Boolean,
    isEditable: Boolean,
    showExtensionInDetails: Boolean,
    showFilenameInDetails: Boolean,
};

Attachment.template = 'mail.component.Attachment';

return Attachment;

});
