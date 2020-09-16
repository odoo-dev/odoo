/** @odoo-module alias=mail.models.Activity **/

import model from 'mail.model.define';

export default model({
    name: 'Activity',
    id: 'mail.models.Activity',
    global: true,
    actions: [
        'mail.models.Activity.actions.convertData',
        'mail.models.Activity.actions.deleteServerRecord',
        'mail.models.Activity.actions.edit',
        'mail.models.Activity.actions.fetchAndUpdate',
        'mail.models.Activity.actions.markAsDone',
        'mail.models.Activity.actions.markAsDoneAndScheduleNext',
    ],
    fields: [
        'mail.models.Activity.fields.assignee',
        'mail.models.Activity.fields.attachments',
        'mail.models.Activity.fields.canWrite',
        'mail.models.Activity.fields.category',
        'mail.models.Activity.fields.chainingType',
        'mail.models.Activity.fields.creator',
        'mail.models.Activity.fields.dateCreate',
        'mail.models.Activity.fields.dateDeadline',
        'mail.models.Activity.fields.feedbackBackup',
        'mail.models.Activity.fields.icon',
        'mail.models.Activity.fields.id',
        'mail.models.Activity.fields.isCurrentPartnerAssignee',
        'mail.models.Activity.fields.mailTemplates',
        'mail.models.Activity.fields.messaging',
        'mail.models.Activity.fields.note',
        'mail.models.Activity.fields.requestingPartner',
        'mail.models.Activity.fields.state',
        'mail.models.Activity.fields.summary',
        'mail.models.Activity.fields.thread',
        'mail.models.Activity.fields.type',
    ],
});
