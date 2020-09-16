/** @odoo-module alias=mail.models.ActivityType **/

import model from 'mail.model.define';

export default model({
    name: 'ActivityType',
    id: 'mail.models.ActivityType',
    global: true,
    fields: [
        'mail.models.ActivityType.fields.activities',
        'mail.models.ActivityType.fields.displayName',
        'mail.models.ActivityType.fields.id',
    ],
});
