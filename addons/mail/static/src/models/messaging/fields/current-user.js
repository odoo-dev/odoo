/** @odoo-module alias=mail.models.Messaging.fields.currentUser **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'currentUser',
    id: 'mail.models.Messaging.fields.currentUser',
    global: true,
    target: 'User',
});
