from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    country_code = fields.Char(related='company_id.country_id.code')

    l10n_eg_pos_serial = fields.Char(string="POS Serial")
    l10n_eg_pos_version = fields.Char(string="POS Version")
    l10n_eg_pos_pre_shared_key = fields.Char(string="POS Pre-Shared Key")
    l10n_eg_pos_model_framework = fields.Char(string="POS Model Framework")
