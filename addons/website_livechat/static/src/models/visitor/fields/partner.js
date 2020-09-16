/** @odoo-module alias=website_livechat.models.Visitor.fields.partner **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Partner linked to this visitor, if any.
 */
export default many2one({
    name: 'partner',
    id: 'website_livechat.models.Visitor.fields.partner',
    global: true,
    target: 'Partner',
});
