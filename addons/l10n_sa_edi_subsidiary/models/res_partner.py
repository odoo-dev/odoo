from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    l10n_sa_vat_group_id = fields.Many2one("l10n_sa.vat.group")
