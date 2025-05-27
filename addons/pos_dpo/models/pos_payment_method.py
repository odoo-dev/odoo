from odoo import fields, models, api, _
from odoo.exceptions import UserError
from .dpo_pos_request import DPOPosRequest

ACCEPTED_CURRENCIES = ["USD", "EUR", "GBP", "KES", "UGX", "TZS", "ZAR", "ZMW"]


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    dpo_tid = fields.Char(
        string="DPO POS Device Serial Number",
        help="Enter the serial number of the DPO POS device (e.g., XXXXXXXX)."
    )
    dpo_mid = fields.Char(
        string="DPO Merchant ID",
        help="Merchant ID assigned by DPO. (e.g., 123456789012)"
    )
    dpo_client_id = fields.Char(
        string="DPO API Client ID",
        help="Client ID provided by DPO for API authentication."
    )
    dpo_client_secret = fields.Char(
        string="DPO API Client Secret",
        help="Client Secret provided by DPO for API authentication."
    )
    dpo_test_mode = fields.Boolean(
        string="Enable DPO Test Mode",
        help="Activate to use DPO's sandbox environment for testing."
    )

    def _get_payment_terminal_selection(self):
        """Extend available payment terminals with DPO."""
        return super()._get_payment_terminal_selection() + [('dpo', 'DPO')]

    def _get_tnx_token(self, src_id):
        TokenStore = self.env["pos.payment.token"]
        token_record = TokenStore.search([("source_id", "=", src_id)], limit=1)
        if token_record:
            return token_record.dpo_token

        token = DPOPosRequest(self).generate_token()
        TokenStore.create({
            "source_id": src_id,
            "dpo_token": token,
        })
        return token

    def dpo_make_payment_request(self, data):
        token = self._get_tnx_token(data["source_id"])
        dpopay = DPOPosRequest(self)
        payload = {
            "transactionType": "pushPaymentSale",
            "sourceId": data['source_id'],
            "amount": str(data['amount']),
        }
        return dpopay.call_network_pos_api(payload, "START_TNX", token)

    def dpo_fetch_payment_status(self, data):
        token = self._get_tnx_token(data["source_id"])
        dpopay = DPOPosRequest(self)
        payload = {
            "sourceId": data['source_id'],
        }
        return dpopay.call_network_pos_api(payload, "GET_STATUS", token)

    def dpo_fetch_payment_result(self, data):
        token = self._get_tnx_token(data["source_id"])
        dpopay = DPOPosRequest(self)
        payload = {
            "sourceId": data['source_id'],
        }
        return dpopay.call_network_pos_api(payload, "GET_RESULT", token)

    def dpo_cancel_payment_request(self, data):
        token = self._get_tnx_token(data["source_id"])
        dpopay = DPOPosRequest(self)
        return dpopay.call_network_pos_api({}, "CANCEL_TNX", token)

    @api.constrains('use_payment_terminal')
    def _check_dpo_terminal(self):
        for record in self:
            if record.use_payment_terminal == 'dpo':
                currency = record.company_id.currency_id.name
                if currency not in ACCEPTED_CURRENCIES:
                    raise UserError(_("The DPO Payment Terminal is only valid for the following currencies: %s", ', '.join(ACCEPTED_CURRENCIES)))
