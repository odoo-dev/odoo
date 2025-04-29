from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"
   
    l10n_id_pajakio_api_key = fields.Char("Pajak.io API Key")
