/** @odoo-module alias=mail.models.ThreadView.fields.checkedMessages **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'checkedMessages',
    id: 'mail.models.ThreadView.fields.checkedMessages',
    global: true,
    target: 'Message',
    related: 'threadCache.checkedMessages',
});
