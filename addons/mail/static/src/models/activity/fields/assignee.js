/** @odoo-module alias=mail.models.Activity.fields.assignee **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'assignee',
    id: 'mail.models.Activity.fields.assignee',
    global: true,
    target: 'User',
});
