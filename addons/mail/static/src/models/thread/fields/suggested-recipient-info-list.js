/** @odoo-module alias=mail.models.Thread.fields.suggestedRecipientInfoList **/

import one2many from 'mail.model.field.one2many.define';

/**
 * Determines the `SuggestedRecipientInfo` concerning `this`.
 */
export default one2many({
    name: 'suggestedRecipientInfoList',
    id: 'mail.models.Thread.fields.suggestedRecipientInfoList',
    global: true,
    target: 'SuggestedRecipientInfo',
    inverse: 'thread',
});
