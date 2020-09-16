/** @odoo-module alias=mail.models.User.fields.partner **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'partner',
    id: 'mail.models.User.fields.partner',
    global: true,
    target: 'Partner',
    inverse: 'user',
});
