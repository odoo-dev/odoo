# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class WebsiteCheckoutStep(models.Model):
    _inherit = 'website.checkout.step'

    def _get_billing_address_alert(self, order_sudo):
        partner_sudo = order_sudo.partner_invoice_id
        mandatory_identifiers = partner_sudo._filter_mandatory_additional_identifiers(
            partner_sudo._get_mandatory_additional_identifiers(
                partner_sudo.country_id, order_sudo=order_sudo,
            ),
            partner_sudo.vat,
        )
        if 'AR_DNI' in mandatory_identifiers and not partner_sudo._get_additional_identifier('AR_DNI'):
            return self.env._(
                "Your order exceeds the maximum amount for an unidentified final consumer."
                " Please provide your identification number.",
            )
        return super()._get_billing_address_alert(order_sudo)
