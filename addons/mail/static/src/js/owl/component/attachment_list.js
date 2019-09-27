odoo.define('mail.component.AttachmentList', function (require) {
'use strict';

const Attachment = require('mail.component.Attachment');

class AttachmentList extends owl.Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.AttachmentList';
    }
}

AttachmentList.components = {
    Attachment,
};

AttachmentList.defaultProps = {
    areAttachmentsDownloadable: false,
    areAttachmentsEditable: false,
    attachmentLocalIds: [],
    attachmentsDetailsMode: 'auto',
    showAttachmentsExtensions: true,
    showAttachmentsFilenames: true,
};

AttachmentList.props = {
    areAttachmentsDownloadable: Boolean,
    areAttachmentsEditable: Boolean,
    attachmentLocalIds: {
        type: Array,
        element: String,
    },
    attachmentsDetailsMode: String, // ['auto', 'card', 'hover', 'none']
    showAttachmentsExtensions: Boolean,
    showAttachmentsFilenames: Boolean,
};

return AttachmentList;

});
