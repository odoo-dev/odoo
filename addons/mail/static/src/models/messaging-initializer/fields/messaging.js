/** @odoo-module alias=mail.models.MessagingInitializer.fields.messaging **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'messaging',
    id: 'mail.models.MessagingInitializer.fields.messaging',
    global: true,
    target: 'Messaging',
    inverse: 'initializer',
});
