/** @odoo-module alias=mail.models.Thread.fields.followersPartner **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'followersPartner',
    id: 'mail.models.Thread.fields.followersPartner',
    global: true,
    target: 'Partner',
    related: 'followers.partner',
});
