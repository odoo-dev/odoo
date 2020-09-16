/** @odoo-module alias=mail.models.FollowerSubtype **/

import model from 'mail.model.define';

export default model({
    name: 'FollowerSubtype',
    id: 'mail.models.FollowerSubtype',
    global: true,
    actions: [
        'mail.models.FollowerSubtype.actions.convertData',
    ],
    fields: [
        'mail.models.FollowerSubtype.fields.id',
        'mail.models.FollowerSubtype.fields.isDefault',
        'mail.models.FollowerSubtype.fields.isInternal',
        'mail.models.FollowerSubtype.fields.name',
        'mail.models.FollowerSubtype.fields.parentModel',
        'mail.models.FollowerSubtype.fields.resModel',
        'mail.models.FollowerSubtype.fields.sequence',
    ],
});
