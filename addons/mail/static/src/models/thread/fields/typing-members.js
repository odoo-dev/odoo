/** @odoo-module alias=mail.models.Thread.fields.typingMembers **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Members that are currently typing something in the composer of this
 * thread, including current partner.
 */
export default many2many({
    name: 'typingMembers',
    id: 'mail.models.Thread.fields.typingMembers',
    global: true,
    target: 'Partner',
});
