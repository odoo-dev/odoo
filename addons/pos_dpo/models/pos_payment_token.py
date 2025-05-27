# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class PosPaymentToken(models.TransientModel):
    _name = 'pos.payment.token'
    _description = 'POS Payment Token Storage'

    source_id = fields.Char(required=True, index=True)
    dpo_token = fields.Char(required=True)
