/** @odoo-module alias=mail.models.Activity.fields.mailTemplates **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'mailTemplates',
    id: 'mail.models.Activity.fields.mailTemplates',
    global: true,
    target: 'MailTemplate',
    inverse: 'activities',
});
