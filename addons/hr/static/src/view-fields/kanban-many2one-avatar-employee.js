/** @odoo-module alias=hr.viewFields.KanbanMany2OneAvatarEmployee **/

import Many2OneAvatarEmployeeMixin from 'hr.viewFields.Many2OneAvatarEmployeeMixin';

import KanbanMany2OneAvatarUser from 'mail.viewFields.KanbanMany2OneAvatarUser';

import fieldRegistry from 'web.field_registry';

const KanbanMany2OneAvatarEmployee = KanbanMany2OneAvatarUser.extend(Many2OneAvatarEmployeeMixin);

fieldRegistry.add('kanban.many2one_avatar_employee', KanbanMany2OneAvatarEmployee);

export default KanbanMany2OneAvatarEmployee;
