from odoo import fields, models


class L10nSaVatGroup(models.Model):
    _name = "l10n_sa.vat.group"
    _description = "Saudi Vat Group"

    name = fields.Char(required=True)
    vat = fields.Char("Tax ID", required=True)
    address = fields.Char()
    partner_ids = fields.One2many("res.partner", "l10n_sa_vat_group_id", domain=[("ref_company_ids", "!=", False), ("country_id.code", "=", "SA")])
