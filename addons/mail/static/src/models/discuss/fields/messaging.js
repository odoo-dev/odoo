/** @odoo-module alias=mail.models.Discuss.fields.messaging **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'messaging',
    id: 'mail.models.Discuss.fields.messaging',
    global: true,
    target: 'Messaging',
    inverse: 'discuss',
});
