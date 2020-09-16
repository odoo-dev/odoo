/** @odoo-module alias=mail.models.AttachmentViewer.fields.scale **/

import attr from 'mail.model.field.attr.define';

/**
 * Scale size of the image. Changes when user zooms in/out.
 */
export default attr({
    name: 'scale',
    id: 'mail.models.AttachmentViewer.fields.scale',
    global: true,
    default: 1,
});
