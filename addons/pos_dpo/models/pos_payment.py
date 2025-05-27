from odoo import models, fields


class PosPayment(models.Model):
    _inherit = "pos.payment"

    dpo_source_id = fields.Char(string='Transaction Ref Id')
