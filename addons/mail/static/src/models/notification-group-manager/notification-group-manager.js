/** @odoo-module alias=mail.models.NotificationGroupManager **/

import model from 'mail.model.define';

export default model({
    name: 'NotificationGroupManager',
    id: 'mail.models.NotificationGroupManager',
    global: true,
    actions: [
        'mail.models.NotificationGroupManager.actions.computeGroups',
    ],
    fields: [
        'mail.models.NotificationGroupManager.fields.groups',
    ],
});
