/** @odoo-module alias=mail.models.ThreadView.fields.uncheckedMessages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'uncheckedMessages',
    id: 'mail.models.ThreadView.fields.uncheckedMessages',
    global: true,
    target: 'Message',
    related: 'threadCache.uncheckedMessages',
});
