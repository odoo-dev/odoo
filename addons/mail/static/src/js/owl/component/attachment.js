odoo.define('mail.component.Attachment', function () {
'use strict';

class Attachment extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.Attachment';
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get attachmentUrl() {
        if (this.props.attachment.isTemporary) {
            return '';
        }
        return this.env.session.url('/web/content', {
            id: this.props.attachment.id,
            download: true,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDownload(ev) {
        window.location = `/web/content/ir.attachment/${this.props.attachment.id}/datas?download=true`;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickImage(ev) {
        if (!this.env.store.getters.isAttachmentViewable(this.props.attachmentLocalId)) {
            return;
        }
        this.env.store.commit('viewAttachments', {
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
        this.env.store.dispatch('unlinkAttachment', this.props.attachmentLocalId);
    }
}

Attachment.defaultProps = {
    hasLabelForCardLayout: true,
    imageSizeForBasicLayout: 'medium',
    isDownloadable: false,
    isEditable: true,
    layout: 'basic',
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
    attachment: Object, // {mail.store.model.Attachment}
    attachmentLocalId: String,
    hasLabelForCardLayout: Boolean,
    imageSizeForBasicLayout: String, // ['small', 'medium', 'large']
    isDownloadable: Boolean,
    isEditable: Boolean,
    layout: String, // ['basic', 'card']
};

return Attachment;

});
