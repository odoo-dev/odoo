# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class PosPaymentTerminal(models.Model):
    _inherit = 'pos.payment.terminal'

    qfpay_terminal_ip_address = fields.Char('QFPay Terminal IP Address', copy=False)
    qfpay_pos_key = fields.Char('QFPay POS Key', copy=False, groups='point_of_sale.group_pos_manager')

    @api.model
    def _load_pos_data_fields(self, config):
        return [*super()._load_pos_data_fields(config), 'qfpay_terminal_ip_address']
