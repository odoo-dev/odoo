/** @odoo-module alias=mail.models.ThreadPartnerSeenInfo.fields.partnerId **/

import many2one from 'mail.model.field.many2one.define';

/**
 * The id of partner this seen info is related to.
 *
 * Should write on this field to set relation between the partner and
 * this seen info, not on `partner`.
 *
 * Reason for not setting the relation directly is the necessity to
 * uniquely identify a seen info based on channel and partner from data.
 * Relational data are list of commands, which is problematic to deduce
 * identifying records.
 *
 * TODO: task-2322536 (normalize relational data) & task-2323665
 * (required fields) should improve and let us just use the relational
 * fields.
 */
export default many2one({
    name: 'partnerId',
    id: 'mail.models.ThreadPartnerSeenInfo.fields.partnerId',
    global: true,
    isId: true,
});
