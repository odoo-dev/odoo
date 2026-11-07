# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _project__menu_project_config_project_stage = models.Ref('project.menu_project_config_project_stage', 'ir.ui.menu')
    _project__menu_projects = models.Ref('project.menu_projects', 'ir.ui.menu')
    _project__menu_projects_config = models.Ref('project.menu_projects_config', 'ir.ui.menu')

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        if self.env.user.has_group('project.group_project_stages'):
            res.append(self._project__menu_projects.id)
            res.append(self._project__menu_projects_config.id)
        if not (
            self.env.user.has_group('project.group_project_stages') and
            self.env.user.has_group('base.group_no_one')
        ):
            res.append(self._project__menu_project_config_project_stage.id)
        return res
