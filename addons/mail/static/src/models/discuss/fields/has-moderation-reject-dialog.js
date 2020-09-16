/** @odoo-module alias=mail.models.Discuss.fields.hasModerationRejectDialog **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine if the moderation reject dialog is displayed.
 */
export default attr({
    name: 'hasModerationRejectDialog',
    id: 'mail.models.Discuss.fields.hasModerationRejectDialog',
    global: true,
    default: false,
});
