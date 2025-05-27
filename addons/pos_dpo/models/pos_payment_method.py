# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from .dpo_pos_request import DPOPosRequest


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    dpo_tid = fields.Char(
        string="DPO Terminal Serial Number",
        help="Enter the serial number of the DPO By Network POS terminal (e.g., XXXXXXXX)."
    )
    dpo_mid = fields.Char(
        string="DPO Merchant ID",
        help="Merchant ID assigned by DPO (e.g., 123456789012)."
    )
    dpo_client_id = fields.Char(
        string="DPO API Client ID",
        help="Client ID provided by DPO for authenticating API requests."
    )
    dpo_client_secret = fields.Char(
        string="DPO API Client Secret",
        help="Client Secret provided by DPO for secure API access."
    )
    dpo_test_mode = fields.Boolean(
        string="Enable DPO Test Mode",
        help="Enable this option to use DPO’s sandbox environment for testing the integration."
    )

    def _get_payment_terminal_selection(self):
        """Extend available payment terminals with DPO."""
        return super()._get_payment_terminal_selection() + [('dpo', 'DPO')]

    def dpo_make_request(self, data, action):
        return DPOPosRequest(self).call_network_pos_api(data, action)
