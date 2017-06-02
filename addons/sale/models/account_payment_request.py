# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class AccountPaymentRequest(models.Model):
    _inherit = "account.payment.request"

    order_id = fields.Many2one('sale.order', string='Order', readonly=True, copy=False)
