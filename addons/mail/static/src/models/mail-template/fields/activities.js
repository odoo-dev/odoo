/** @odoo-module alias=mail.models.MailTemplate.fields.activities **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'activities',
    id: 'mail.models.MailTemplate.fields.activities',
    global: true,
    target: 'Activity',
    inverse: 'mailTemplates',
});
