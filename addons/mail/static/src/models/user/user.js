/** @odoo-module alias=mail.models.User **/

import model from 'mail.model.define';

export default model({
    name: 'User',
    id: 'mail.models.User',
    global: true,
    actions: [
        'mail.models.User.actions.convertData',
        'mail.models.User.actions.fetchPartner',
        'mail.models.User.actions.getChat',
        'mail.models.User.actions.openChat',
        'mail.models.User.actions.openProfile',
        'mail.models.User.actions.performRpcRead',
    ],
    fields: [
        'mail.models.User.fields.displayName',
        'mail.models.User.fields.id',
        'mail.models.User.fields.model',
        'mail.models.User.fields.nameOrDisplayName',
        'mail.models.User.fields.partner',
    ],
    lifecycles: [
        'mail.models.User.lifecycles.onDelete',
    ],
});
