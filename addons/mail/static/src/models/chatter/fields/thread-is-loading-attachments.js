/** @odoo-module alias=mail.models.Chatter.fields.threadIsLoadingAttachments **/

import attr from 'mail.model.fields.attr.define';

/**
 * Serves as compute dependency.
 */
export default attr({
    name: 'threadIsLoadingAttachments',
    id: 'mail.models.Chatter.fields.threadIsLoadingAttachments',
    global: true,
    related: 'thread.isLoadingAttachments',
});
