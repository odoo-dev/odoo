/** @odoo-module alias=mail.models.Composer.fields.isPostingMessage **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether a post_message request is currently pending.
 */
export default attr({
    name: 'isPostingMessage',
    id: 'mail.models.Composer.fields.isPostingMessage',
    global: true,
    default: false,
});
