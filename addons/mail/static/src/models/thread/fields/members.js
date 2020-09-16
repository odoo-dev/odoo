/** @odoo-module alias=mail.models.Thread.fields.members **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'members',
    id: 'mail.models.Thread.fields.members',
    global: true,
    target: 'Partner',
    inverse: 'memberThreads',
});
