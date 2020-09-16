/** @odoo-module alias=mail.viewFields.KanbanMany2OneAvatarUser **/

import Many2OneAvatarUser from 'mail.viewFields.Many2OneAvatarUser';

import fieldRegistry from 'web.field_registry';

const KanbanMany2OneAvatarUser = Many2OneAvatarUser.extend({
    _template: 'mail.KanbanMany2OneAvatarUser',
});

fieldRegistry.add('kanban.many2one_avatar_user', KanbanMany2OneAvatarUser);

export default KanbanMany2OneAvatarUser;
