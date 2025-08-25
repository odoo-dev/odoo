from odoo import _, api, fields, models


class L10n_InSectionAlert(models.Model):
    _name = 'l10n_in.hsn.entity'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = "Indian HSN Entity"
    _rec_name = "hsn_code"

    hsn_code = fields.Char(string="HSN Code", required=True)
    currency_id = fields.Many2one(
        "res.currency",
        string="Currency",
        required=True,
        default=lambda self: self.env.company.currency_id,
    )
    price_per_unit = fields.Monetary(
        string="Price per Unit",
        currency_field="currency_id",
        required=True,
        default=0.0,
    )
    tax_id = fields.Many2one(
        "account.tax",
        string="Tax Rate",
        domain=[("type_tax_use", "=", "sale")],
        )

    _uniq_hsn_code = models.Constraint(
        "unique(hsn_code)",
        "HSN Code must be unique.",
    )