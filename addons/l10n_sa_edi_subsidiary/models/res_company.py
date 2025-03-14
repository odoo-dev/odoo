from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    l10n_sa_vat_group_id = fields.Many2one("l10n_sa.vat.group", related="partner_id.l10n_sa_vat_group_id", readonly=False)
