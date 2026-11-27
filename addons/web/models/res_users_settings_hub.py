from odoo import fields, models


class ResUsersSettingsHub(models.Model):
    _name = 'res.users.settings.hub'
    _description = 'User Settings for Hubs'

    user_setting_id = fields.Many2one('res.users.settings', required=True, ondelete='cascade', index=True, export_string_translation=False)
    res_model = fields.Char(required=True, export_string_translation=False)
    res_id = fields.Integer(required=True, export_string_translation=False)
    # ordered keys of the items pinned by the user (see web_get_hub)
    pinned_item_keys = fields.Json(export_string_translation=False)
    # whether the user shows the tabs of the hub for the record
    show_tabs = fields.Boolean(export_string_translation=False)

    _res_users_settings_hub_unique = models.Constraint(
        'UNIQUE (user_setting_id, res_model, res_id)',
        'The user should have one unique hub setting per record.',
    )
