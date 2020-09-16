/** @odoo-module alias=mail.models.Partner.fields.user **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'user',
    id: 'mail.models.Partner.fields.user',
    global: true,
    target: 'User',
    inverse: 'partner',
});
