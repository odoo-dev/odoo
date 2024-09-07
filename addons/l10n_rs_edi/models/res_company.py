from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_rs_edi_api_key = fields.Char("eFaktura API Key")
