# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _hr__menu_hr_department_kanban = models.Ref('hr.menu_hr_department_kanban', 'ir.ui.menu', required=False)

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        if not self.env.user.has_group('hr.group_hr_user'):
            is_department_manager = bool(self.env["hr.department"].search_count([
                ('manager_id', 'in', self.env.user.employee_ids.ids)
            ], limit=1))
            if not is_department_manager and (dep_menu := self._hr__menu_hr_department_kanban):
                res.append(dep_menu.id)
        return res
