/** @odoo-module alias=mail.models.Attachment **/

import model from 'mail.model.define';

export default model({
    name: 'Attachment',
    id: 'mail.models.Attachment',
    global: true,
    actions: [
        'mail.models.Attachment.actions.convertData',
        'mail.models.Attachment.actions.remove',
        'mail.models.Attachment.actions.view',
    ],
    fields: [
        'mail.models.Attachment.fields.activities',
        'mail.models.Attachment.fields.AttachmentViewer',
        'mail.models.Attachment.fields.checkSum',
        'mail.models.Attachment.fields.composers',
        'mail.models.Attachment.fields.defaultSource',
        'mail.models.Attachment.fields.displayName',
        'mail.models.Attachment.fields.extension',
        'mail.models.Attachment.fields.fileType',
        'mail.models.Attachment.fields.filename',
        'mail.models.Attachment.fields.id',
        'mail.models.Attachment.fields.isLinkedToComposer',
        'mail.models.Attachment.fields.isTextFile',
        'mail.models.Attachment.fields.isUnlinkPending',
        'mail.models.Attachment.fields.isUploading',
        'mail.models.Attachment.fields.isViewable',
        'mail.models.Attachment.fields.mediaType',
        'mail.models.Attachment.fields.messages',
        'mail.models.Attachment.fields.mimetype',
        'mail.models.Attachment.fields.name',
        'mail.models.Attachment.fields.originThread',
        'mail.models.Attachment.fields.size',
        'mail.models.Attachment.fields.threads',
        'mail.models.Attachment.fields.type',
        'mail.models.Attachment.fields.uploadingAbortController',
        'mail.models.Attachment.fields.url',
    ],
});

// let nextUploadingId = -1;
// function getAttachmentNextUploadingId() {
//     const id = nextUploadingId;
//     nextUploadingId -= 1;
//     return id;
// }
// function factory(dependencies) {

//     class Attachment extends dependencies['mail.model'] {

//         //----------------------------------------------------------------------
//         // Public
//         //----------------------------------------------------------------------

//         /**
//          * @override
//          */
//         static create(data) {
//             const isMulti = typeof data[Symbol.iterator] === 'function';
//             const dataList = isMulti ? data : [data];
//             for (const data of dataList) {
//                 if (!data.id) {
//                     data.id = getAttachmentNextUploadingId();
//                 }
//             }
//             return super.create(...arguments);
//         }

//     }
// }
