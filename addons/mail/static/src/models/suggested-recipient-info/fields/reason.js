/** @odoo-module alias=mail.models.SuggestedRecipientInfo.fields.reason **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines why `this` is a suggestion for `this.thread`. It serves as
 * visual clue when displaying `this`.
 */
export default attr({
    name: 'reason',
    id: 'mail.models.SuggestedRecipientInfo.fields.reason',
    global: true,
});
