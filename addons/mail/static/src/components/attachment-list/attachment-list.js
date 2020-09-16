/** @odoo-module alias=mail.components.AttachmentList **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class AttachmentList extends usingModels(Component) {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {Attachment[]}
     */
    get imageAttachments() {
        return this.attachments.filter(attachment => attachment.fileType(this) === 'image');
    }

    /**
     * @returns {Attachment[]}
     */
    get nonImageAttachments() {
        return this.attachments.filter(attachment => attachment.fileType(this) !== 'image');
    }

    /**
     * @returns {Attachment[]}
     */
    get viewableAttachments() {
        return this.attachments.filter(attachment => attachment.isViewable(this));
    }

}

Object.assign(AttachmentList, {
    defaultProps: {
        attachments: [],
    },
    props: {
        areAttachmentsDownloadable: {
            type: Boolean,
            optional: true,
        },
        areAttachmentsEditable: {
            type: Boolean,
            optional: true,
        },
        attachments: {
            type: Array,
            element: Object,
            validate(p) {
                for (const i of p) {
                    if (i.constructor.modelName !== 'Attachment') {
                        return false;
                    }
                }
                return true;
            },
        },
        attachmentsDetailsMode: {
            type: String,
            optional: true,
            validate: prop => ['auto', 'card', 'hover', 'none'].includes(prop),
        },
        attachmentsImageSize: {
            type: String,
            optional: true,
            validate: prop => ['small', 'medium', 'large'].includes(prop),
        },
        showAttachmentsExtensions: {
            type: Boolean,
            optional: true,
        },
        showAttachmentsFilenames: {
            type: Boolean,
            optional: true,
        },
    },
    template: 'mail.AttachmentList',
});

QWeb.registerComponent('AttachmentList', AttachmentList);

export default AttachmentList;
