from odoo import models, fields


class PosPaymentToken(models.TransientModel):
    _name = 'pos.payment.token'
    _description = 'POS Payment Token Storage'

    source_id = fields.Char(required=True)
    dpo_token = fields.Char(required=True)
