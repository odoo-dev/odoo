/** @odoo-module alias=mail.models.Follower.fields.partner **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'partner',
    id: 'mail.models.Follower.fields.partner',
    global: true,
    target: 'Partner',
});
