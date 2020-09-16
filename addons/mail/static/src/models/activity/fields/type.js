/** @odoo-module alias=mail.models.Activity.fields.type **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'type',
    id: 'mail.models.Activity.fields.type',
    global: true,
    target: 'ActivityType',
    inverse: 'activities',
});
