/** @odoo-module alias=mail.models.SuggestedRecipientInfo.fields.partner **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines the optional `Partner` associated to `this`.
 */
export default many2one({
    name: 'partner',
    id: 'mail.models.SuggestedRecipientInfo.fields.partner',
    global: true,
    target: 'Partner',
});
