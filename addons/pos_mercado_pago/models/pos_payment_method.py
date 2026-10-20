import logging

from odoo import _, fields, models
from odoo.exceptions import AccessError, UserError

from .mercado_pago_pos_request import MERCADO_PAGO_PLATFORM_ID, MercadoPagoPosRequest

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    mp_bearer_token = fields.Char(
        string="Production user token",
        help='Mercado Pago customer production user token: https://www.mercadopago.com.mx/developers/en/reference',
        groups="point_of_sale.group_pos_manager")
    mp_webhook_secret_key = fields.Char(
        string="Production secret key",
        help='Mercado Pago production secret key from integration application: https://www.mercadopago.com.mx/developers/panel/app',
        groups="point_of_sale.group_pos_manager")
    mp_webhook_endpoint = fields.Char(string="Mercado Pago Webhook Endpoint", compute='_compute_mp_webhook_endpoint', readonly=True)

    def _get_terminal_provider_selection(self):
        return super()._get_terminal_provider_selection() + [('mercado_pago', 'Mercado Pago')]

    def _get_providers_with_terminals(self):
        return super()._get_providers_with_terminals() + ['mercado_pago']

    def _allowed_actions_in_self_order(self):
        return super()._allowed_actions_in_self_order() + ['mp_order_create', 'mp_order_get']

    def _check_special_access(self):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

    def _compute_mp_webhook_endpoint(self):
        for record in self:
            web_base_url = record.get_base_url()
            record.mp_webhook_endpoint = f"{web_base_url}/pos_mercado_pago/notification"

    def force_pdv(self):
        """
        Triggered in debug mode when the user wants to force the "PDV" mode.
        It calls the Mercado Pago API to set the mode of all the terminals of the
        payment method to "PDV".
        """
        self.ensure_one()
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        _logger.info('Calling Mercado Pago to force the terminal mode to "PDV"')

        payload = {"terminals": [
            {"id": terminal.mp_id_point_smart_complet, "operating_mode": "PDV"}
            for terminal in self.sudo().terminal_ids
        ]}
        resp = mercado_pago.call_mercado_pago("patch", "/terminals/v1/setup", payload)
        terminals = resp.get("terminals")
        if not terminals or any(terminal.get("operating_mode") != "PDV" for terminal in terminals):
            raise UserError(_("Unexpected Mercado Pago response: %s", resp))
        _logger.debug("Successfully set the terminal mode to 'PDV'.")

    def mp_order_create(self, infos, terminal_id: int | None = None):
        """
        Called from frontend to create an order in Mercado Pago, processed by the given terminal
        """
        self._check_special_access()
        terminal_sudo = self._get_payment_terminal(terminal_id).sudo()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        infos['config'] = {
            'point': {
                'terminal_id': terminal_sudo.mp_id_point_smart_complet,
            },
        }
        # Identify Odoo as the integrator
        infos['integration_data'] = {
            'platform_id': MERCADO_PAGO_PLATFORM_ID,
        }
        infos['expiration_time'] = 'PT30M'

        resp = mercado_pago.call_mercado_pago("post", "/v1/orders", infos, idempotent=True)
        _logger.debug("mp_order_create(), response from Mercado Pago: %s", resp)
        return resp

    def mp_order_get(self, order_id):
        """
        Called from frontend to get the order status from Mercado Pago
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Call Mercado Pago for the order status
        resp = mercado_pago.call_mercado_pago("get", f"/v1/orders/{order_id}", {})
        _logger.debug("mp_order_get(), response from Mercado Pago: %s", resp)
        return resp

    def mp_order_refund(self, order_id, amount=None):
        """
        Called from frontend to refund a Mercado Pago order.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        if amount is None:
            body = {}
        else:
            order = self.mp_order_get(order_id)
            payments = order.get("transactions", {}).get("payments")
            if not payments:
                return {"errorMessage": _("Original Mercado Pago payment not found on order %s", order_id)}
            body = {"transactions": [{"id": payments[0]["id"], "amount": amount}]}
        resp = mercado_pago.call_mercado_pago("post", f"/v1/orders/{order_id}/refund", body, idempotent=True)
        _logger.debug("mp_order_refund(), response from Mercado Pago: %s", resp)
        return resp

    def _find_terminal(self, token, point_smart):
        mercado_pago = MercadoPagoPosRequest(token)
        data = mercado_pago.call_mercado_pago("get", "/terminals/v1/list", {}).get('data', {})
        if 'terminals' not in data:
            raise UserError(_("Please verify your production user token as it was rejected"))

        # Search for a terminal id that contains the serial number entered by the user
        found_terminal = next((t for t in data['terminals'] if point_smart in t['id']), None)
        if not found_terminal:
            raise UserError(_("The terminal serial number is not registered on Mercado Pago"))
        return found_terminal.get('id', '')

    def write(self, vals):
        records = super().write(vals)

        if 'mp_bearer_token' in vals:
            # The terminals are found with the token, see `pos.payment.terminal` for their creation
            self.terminal_ids._mp_find_point_smart()

        return records
