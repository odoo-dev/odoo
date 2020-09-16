/** @odoo-module alias=mail.models.Chatter.fields.isAttachmentBoxVisible **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determiners whether the attachment box is currently visible.
 */
export default attr({
    name: 'isAttachmentBoxVisible',
    id: 'mail.models.Chatter.fields.isAttachmentBoxVisible',
    global: true,
    default: false,
});
