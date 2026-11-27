from odoo import models


class ResUsersSettings(models.Model):
    _inherit = 'res.users.settings'

    def get_default_hub_setting(self, res_model, res_id):
        """ Start from the pinned items of the project manager on a project. """
        res = super().get_default_hub_setting(res_model, res_id)
        if res_model != 'project.project':
            return res
        project_manager = self.env['project.project'].browse(res_id).exists().user_id
        if not project_manager or project_manager == self.user_id:
            return res
        # sudo: the settings of the project manager are not readable by the user
        manager_setting_sudo = self.env['res.users.settings.hub'].sudo().search([
            ('user_setting_id.user_id', '=', project_manager.id),
            ('res_model', '=', res_model),
            ('res_id', '=', res_id),
        ], limit=1)
        if manager_setting_sudo.pinned_item_keys:
            res['pinned_item_keys'] = manager_setting_sudo.pinned_item_keys
        return res
