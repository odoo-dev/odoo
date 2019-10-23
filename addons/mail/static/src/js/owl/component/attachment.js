odoo.define('mail.component.Attachment', function () {
'use strict';

const { Component } = owl;
const { useDispatch, useGetters, useStore } = owl.hooks;

class Attachment extends Component {

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
                attachment: state.attachments[props.attachmentLocalId],
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Return the url of the attachment. Temporary attachments, a.k.a. uploading
     * attachments, do not have an url.
     *
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

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Download the attachment when clicking on donwload icon.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDownload(ev) {
        window.location = `/web/content/ir.attachment/${this.storeProps.attachment.id}/datas?download=true`;
    }

    /**
     * Open the attachment viewer when clicking on viewable attachment.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickImage(ev) {
        if (!this.storeGetters.isAttachmentViewable(this.props.attachmentLocalId)) {
            return;
        }
        this.storeDispatch('viewAttachments', {
            attachmentLocalId: this.props.attachmentLocalId,
            attachmentLocalIds: this.props.attachmentLocalIds.filter(localId =>
                this.storeGetters.isAttachmentViewable(localId)),
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickUnlink(ev) {
        this.storeDispatch('unlinkAttachment', this.props.attachmentLocalId);
    }
}

Attachment.defaultProps = {
    attachmentLocalIds: [],
    hasLabelForCardLayout: true,
    imageSizeForBasicLayout: 'medium',
    isDownloadable: false,
    isEditable: true,
    layout: 'basic',
};

Attachment.props = {
    attachmentLocalId: String,
    attachmentLocalIds: {
        type: Array,
        element: String,
        optional: true,
    },
    hasLabelForCardLayout: {
        type: Boolean,
        optional: true,
    },
    imageSizeForBasicLayout: {
        type: String, // ['small', 'medium', 'large']
        optional: true,
    },
    isDownloadable: {
        type: Boolean,
        optional: true,
    },
    isEditable: {
        type: Boolean,
        optional: true,
    },
    layout: {
        type: String, // ['basic', 'card']
        optional: true,
    },
};

Attachment.template = 'mail.component.Attachment';

return Attachment;

});
