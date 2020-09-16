/** @odoo-module alias=mail.models.MailTemplate **/

import model from 'mail.model.define';

export default model({
    name: 'MailTemplate',
    id: 'mail.models.MailTemplate',
    global: true,
    actions: [
        'mail.models.MailTemplate.actions.preview',
        'mail.models.MailTemplate.actions.send',
    ],
    fields: [
        'mail.models.MailTemplate.fields.activities',
        'mail.models.MailTemplate.fields.id',
        'mail.models.MailTemplate.fields.name',
    ],
});
