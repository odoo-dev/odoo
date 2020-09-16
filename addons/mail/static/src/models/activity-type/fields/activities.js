/** @odoo-module alias=mail.models.ActivityType.fields.activities **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'activities',
    id: 'mail.models.ActivityType.fields.activities',
    global: true,
    target: 'Activity',
    inverse: 'type',
});
