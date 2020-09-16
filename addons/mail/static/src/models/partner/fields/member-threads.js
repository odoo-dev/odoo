/** @odoo-module alias=mail.models.Partner.fields.memberThreads **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'memberThreads',
    id: 'mail.models.Partner.fields.memberThreads',
    global: true,
    target: 'Thread',
    inverse: 'members',
});
