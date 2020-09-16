/** @odoo-module alias=mail.models.ThreadView.fields.nonEmptyMessages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'nonEmptyMessages',
    id: 'mail.models.ThreadView.fields.nonEmptyMessages',
    global: true,
    target: 'Message',
    related: 'threadCache.nonEmptyMessages',
});
