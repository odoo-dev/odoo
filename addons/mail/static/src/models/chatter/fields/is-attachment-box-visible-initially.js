/** @odoo-module alias=mail.models.Chatter.fields.isAttachmentBoxVisibleInitially **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determiners whether the attachment box is visible initially.
 */
export default attr({
    name: 'isAttachmentBoxVisibleInitially',
    id: 'mail.models.Chatter.fields.isAttachmentBoxVisibleInitially',
    global: true,
    default: false,
});
