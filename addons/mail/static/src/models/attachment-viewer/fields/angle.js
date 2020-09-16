/** @odoo-module alias=mail.models.AttachmentViewer.fields.angle **/

import attr from 'mail.model.field.attr.define';

/**
 * Angle of the image. Changes when the user rotates it.
 */
export default attr({
    name: 'angle',
    id: 'mail.models.AttachmentViewer.fields.angle',
    global: true,
    default: 0,
});
