# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PaymentToken(models.Model):
    _inherit = "payment.token"

    paypal_customer_id = fields.Char(string="PayPal Customer ID", readonly=True)

    # === COMPUTE METHODS === #

    @api.depends("payment_details", "create_date")
    def _compute_display_name(self):
        """Override of `payment` to only pad the display name of card tokens.

        The payment details of PayPal wallet tokens are not card digits, so they must not be padded.
        """
        unpadded_tokens = self.filtered(
            lambda token: token.provider_code == "paypal" and token.payment_method_code != "card"
        )
        for token in unpadded_tokens:
            token.display_name = token.sudo()._build_display_name(should_pad=False)
        super(PaymentToken, self - unpadded_tokens)._compute_display_name()
