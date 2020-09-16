/** @odoo-module alias=mail.models.Thread.fields.isLoadingAttachments **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether `this` is currently loading attachments.
 */
export default attr({
    name: 'isLoadingAttachments',
    id: 'mail.models.Thread.fields.isLoadingAttachments',
    global: true,
    default: false,
});
