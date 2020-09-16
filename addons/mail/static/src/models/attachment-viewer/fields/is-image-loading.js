/** @odoo-module alias=mail.models.AttachmentViewer.fields.isImageLoading **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the image is loading or not. Useful to diplay
 * a spinner when loading image initially.
 */
export default attr({
    name: 'isImageLoading',
    id: 'mail.models.AttachmentViewer.fields.isImageLoading',
    global: true,
    default: false,
});
