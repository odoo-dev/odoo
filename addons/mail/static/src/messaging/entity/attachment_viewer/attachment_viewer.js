odoo.define('mail.messaging.entity.AttachmentViewer', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, many2one } = require('mail.messaging.EntityField');

function AttachmentViewerFactory({ Entity }) {

    class AttachmentViewer extends Entity {}

    AttachmentViewer.entityName = 'AttachmentViewer';

    AttachmentViewer.fields = {
        /**
         * Angle of the image. Changes when the user rotates it.
         */
        angle: attr({
            default: 0,
        }),
        attachment: many2one('Attachment'),
        attachments: many2many('Attachment', {
            inverse: 'attachmentViewer',
        }),
        /**
         * Determine whether the image is loading or not. Useful to diplay
         * a spinner when loading image initially.
         */
        isImageLoading: attr({
            default: false,
        }),
        /**
         * Scale size of the image. Changes when user zooms in/out.
         */
        scale: attr({
            default: 1,
        }),
    };

    return AttachmentViewer;
}

registerNewEntity('AttachmentViewer', AttachmentViewerFactory);

});
