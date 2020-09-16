/** @odoo-module alias=mail.models.Activity.fields.creator **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'creator',
    id: 'mail.models.Activity.fields.creator',
    global: true,
    target: 'User',
});
