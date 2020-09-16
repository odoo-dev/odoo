/** @odoo-module alias=mail.models.ThreadView.fields.messages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'messages',
    id: 'mail.models.ThreadView.fields.messages',
    global: true,
    target: 'Message',
    related: 'threadCache.messages',
});
