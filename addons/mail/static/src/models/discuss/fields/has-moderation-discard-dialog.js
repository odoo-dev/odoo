/** @odoo-module alias=mail.models.Discuss.fields.hasModerationDiscardDialog **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine if the moderation discard dialog is displayed.
 */
export default attr({
    name: 'hasModerationDiscardDialog',
    id: 'mail.models.Discuss.fields.hasModerationDiscardDialog',
    global: true,
    default: false,
});
