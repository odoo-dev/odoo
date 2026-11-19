from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_eg_dual_language_invoice = fields.Boolean(string="Egyptian Dual Language Invoices")
