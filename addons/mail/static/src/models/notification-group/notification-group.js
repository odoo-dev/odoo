/** @odoo-module alias=mail.models.NotificationGroup **/

import model from 'mail.model.define';

export default model({
    name: 'NotificationGroup',
    id: 'mail.models.NotificationGroup',
    global: true,
    actions: [
        'mail.models.NotificationGroup.actions._openDocuments',
        'mail.models.NotificationGroup.actions.openCancelAction',
        'mail.models.NotificationGroup.actions.openDocuments',
    ],
    fields: [
        'mail.models.NotificationGroup.fields.date',
        'mail.models.NotificationGroup.fields.id',
        'mail.models.NotificationGroup.fields.notifications',
        'mail.models.NotificationGroup.fields.resId',
        'mail.models.NotificationGroup.fields.resModel',
        'mail.models.NotificationGroup.fields.resModelName',
        'mail.models.NotificationGroup.fields.thread',
        'mail.models.NotificationGroup.fields.type',
    ],
});
