/** @odoo-module alias=mail.models.Follower **/

import model from 'mail.model.define';

export default model({
    name: 'Follower',
    id: 'mail.models.Follower',
    global: true,
    actions: [
        'mail.models.Follower.actions.closeSubtypes',
        'mail.models.Follower.actions.convertData',
        'mail.models.Follower.actions.openProfile',
        'mail.models.Follower.actions.remove',
        'mail.models.Follower.actions.selectSubtype',
        'mail.models.Follower.actions.showSubtypes',
        'mail.models.Follower.actions.unselectSubtype',
        'mail.models.Follower.actions.updateSubtypes',
    ],
    fields: [
        'mail.models.Follower.fields.channel',
        'mail.models.Follower.fields.followedThread',
        'mail.models.Follower.fields.id',
        'mail.models.Follower.fields.isActive',
        'mail.models.Follower.fields.isEditable',
        'mail.models.Follower.fields.name',
        'mail.models.Follower.fields.partner',
        'mail.models.Follower.fields.resId',
        'mail.models.Follower.fields.resModel',
        'mail.models.Follower.fields.selectedSubtypes',
        'mail.models.Follower.fields.subtypes',
    ],
});
