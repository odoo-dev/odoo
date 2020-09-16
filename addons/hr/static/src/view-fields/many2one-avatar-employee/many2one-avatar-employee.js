/** @odoo-module alias=hr.viewFields.Many2OneAvatarEmployee **/

// This module defines a variant of the Many2OneAvatarUser field widget,
// to support many2one fields pointing to 'hr.employee'. It also defines the
// kanban version of this widget.
//
// Usage:
//   <field name="employee_id" widget="many2one_avatar_employee"/>

import Many2OneAvatarEmployeeMixin from 'hr.viewFields.Many2OneAvatarEmployeeMixin';

import Many2OneAvatarUser from 'mail.viewFields.Many2OneAvatarUser';

import fieldRegistry from 'web.field_registry';

const Many2OneAvatarEmployee = Many2OneAvatarUser.extend(Many2OneAvatarEmployeeMixin);

fieldRegistry.add('many2one_avatar_employee', Many2OneAvatarEmployee);

export default Many2OneAvatarEmployee;
