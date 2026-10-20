import requests

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

from odoo.addons.pos_sumup.models.pos_payment_method import SUMUP_API_URL


class PosPaymentTerminal(models.Model):
    _inherit = "pos.payment.terminal"

    # Create a new reader on SumUp platform or use an existing one
    sumup_terminal_id = fields.Char(
        string="Reader ID",
        copy=False,
        help="SumUp reader identifier (e.g. rdr_3MSAFM23CK82VSTT4BN6RWSQ65).",
    )
    sumup_pairing_code = fields.Char(
        string="Pairing Code",
        copy=False,
        help="Code displayed on the reader screen, used to pair it once.",
    )

    @api.constrains("sumup_terminal_id")
    def _check_sumup_terminal_id(self):
        for terminal in self:
            if not terminal.sumup_terminal_id:
                continue
            existing_terminal = terminal.sudo().search(
                [
                    ("id", "!=", terminal.id),
                    ("sumup_terminal_id", "=", terminal.sumup_terminal_id),
                ],
                limit=1,
            )
            if not existing_terminal:
                continue
            existing_payment_method = existing_terminal.payment_method_id
            if existing_payment_method.company_id == terminal.payment_method_id.company_id:
                raise ValidationError(
                    self.env._(
                        "Reader %(terminal)s is already used on payment method %(payment_method)s.",
                        terminal=terminal.sumup_terminal_id,
                        payment_method=existing_payment_method.display_name,
                    ),
                )
            raise ValidationError(
                self.env._(
                    "Reader %(terminal)s is already used in company %(company)s on payment method %(payment_method)s.",
                    terminal=terminal.sumup_terminal_id,
                    company=existing_payment_method.company_id.name,
                    payment_method=existing_payment_method.display_name,
                ),
            )

    @api.model_create_multi
    def create(self, vals_list):
        pairing_codes = [vals.pop("sumup_pairing_code", False) for vals in vals_list]
        terminals = super().create(vals_list)
        for terminal, pairing_code in zip(terminals, pairing_codes):
            if pairing_code:
                terminal.sumup_terminal_id = terminal._sumup_pair_reader(pairing_code)
        return terminals

    def write(self, vals):
        if not vals.get("sumup_pairing_code"):
            return super().write(vals)

        for terminal in self:
            super(PosPaymentTerminal, terminal).write({
                **vals,
                "sumup_terminal_id": terminal._sumup_pair_reader(vals["sumup_pairing_code"]),
                "sumup_pairing_code": False,
            })
        return True

    def _sumup_pair_reader(self, pairing_code: str):
        """Pair the reader displaying `pairing_code` with the SumUp merchant account of the
        payment method and return its reader id."""
        self.ensure_one()
        payment_method = self.payment_method_id
        if not payment_method.sumup_merchant_code:
            raise UserError(self.env._("Please set the SumUp merchant code first."))

        try:
            response = requests.post(
                f"{SUMUP_API_URL}/v0.1/merchants/{payment_method.sumup_merchant_code}/readers",
                json={
                    "pairing_code": pairing_code,
                    "name": f"Odoo - {payment_method.name} - {self.display_name}",
                },
                headers={"Authorization": f"Bearer {payment_method.sudo().sumup_api_key}"},
                timeout=10,
            )
        except requests.exceptions.RequestException:
            raise UserError(self.env._("Could not reach SumUp. Please try again in a moment."))

        if not response.ok:
            try:
                error_detail = response.json().get("detail")
            except ValueError:
                error_detail = None
            raise UserError(
                self.env._(
                    "Could not pair the reader: %(error)s",
                    error=error_detail or response.text,
                ),
            )

        return response.json()["id"]
