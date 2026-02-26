import hashlib
import json
import requests

from odoo import _, fields, models, api
from odoo.exceptions import UserError, AccessDenied


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [("qlub", "Qlub")]

    qlub_pos_name = fields.Char("Qlub PoS Vendor Identifer", copy=False)
    qlub_key = fields.Char("Qlub Secret Key", copy=False, groups="point_of_sale.group_pos_manager")
    qlub_location = fields.Char("Qlub Restaurant Outlet Identifier", copy=False)
    qlub_terminal = fields.Char("Qlub Terminal Identifier", copy=False)
    qlub_test_mode = fields.Boolean("Qlub Test Mode", copy=False)
    qlub_domain = fields.Char("Qlub Domain", compute="_compute_qlub_domain", readonly=False)
    qlub_url = fields.Char("Qlub Transaction URL", compute="_compute_qlub_url")

    @api.constrains("use_payment_terminal")
    def _check_qlub_terminal(self):
        if any(record.use_payment_terminal == "qlub" and record.company_id.currency_id.name != "HKD" for record in self):
            raise UserError(_("To use Qlub, the company currency must be HKD."))

    def _is_write_forbidden(self, fields):
        return super()._is_write_forbidden(fields - {"qlub_latest_response"})

    @api.depends("qlub_test_mode")
    def _compute_qlub_domain(self):
        for method in self:
            method.qlub_domain = "api-staging.qlub.cloud" if method.qlub_test_mode else "api.qlub.cloud"

    @api.depends("qlub_pos_name", "company_id", "qlub_domain")
    def _compute_qlub_url(self):
        for method in self:
            region = "hk"
            method.qlub_url = f"https://{method.qlub_domain}/webhook/pos/{region}/{method.qlub_pos_name}/transaction"

    def _qlub_sign_request(self, payload):
        self.ensure_one()
        key = self.sudo().qlub_key
        to_hash = f"{payload["timestamp"]}{key}{payload["event"]}{payload["location_id"]}"
        return hashlib.sha256(to_hash.encode()).hexdigest()

    def _post_process_qlub_payload(self, payload):
        self.ensure_one()
        self.sudo()
        payload["location_id"] = self.qlub_location
        payload["payload"]["pos_terminal_id"] = self.qlub_terminal

    @api.model
    def _get_qlub_error_message(self, status):
        match status:
            case 400:
                return _("The transaction request to Qlub is malformed.")
            case 403:
                return _("Signature verification has failed. The secret key might be incorrect.")
            case 404:
                return _("The Qlub Restaurant Outlet ID cannot be identified.")
            case 409:
                return _(
                    """A transaction with the same ID is ongoing.
                    Check the terminal for payment or remove this transaction line and try again."""
                )
            case 500:
                return _("Qlub server cannot process the transaction. Please retry.")
            case _:
                return _("Qlub transaction request has failed. Please retry.")

    @api.model
    def _call_qlub(self, signature, payload):
        try:
            response = requests.post(
                self.qlub_url,
                headers={
                    "Signature": signature,
                    "Content-Type": "application/json",
                },
                data=json.dumps(payload),
                timeout=30
            )
        except requests.exceptions.RequestException as e:
            return {"error": "%s\n%s" % (_("Qlub transaction request has failed. Please retry."), e)}

        if not response.ok:
            return {"error": "%s\n%s" % (self._get_qlub_error_message(response.status_code), response.json().get("message"))}

        return {"success": response.status_code}

    def qlub_send_payment_request(self, payload):
        self.ensure_one()
        if not self.env.su and not self.env.user.has_group("point_of_sale.group_pos_user"):
            raise AccessDenied()

        if self.use_payment_terminal != "qlub":
            raise UserError(_("This method can only be used with Qlub payment terminal."))

        self._post_process_qlub_payload(payload)
        signature = self._qlub_sign_request(payload)
        return self._call_qlub(signature, payload)
