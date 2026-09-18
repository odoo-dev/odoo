# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class WebsiteCheckoutStep(models.Model):
    _inherit = 'website.checkout.step'

    def _check_shop_address_completion(self, order_sudo, **kwargs):
        alerts = list(order_sudo._get_alerts())
        href = super()._check_shop_address_completion(order_sudo, **kwargs)
        partner_sudo = order_sudo.partner_invoice_id
        if href != f'/shop/address?partner_id={partner_sudo.id}&address_type=billing':
            return href
        mandatory_identifiers = partner_sudo._filter_mandatory_additional_identifiers(
            partner_sudo._get_mandatory_additional_identifiers(
                partner_sudo.country_id, order_sudo=order_sudo,
            ),
            partner_sudo.vat,
        )
        if 'AR_DNI' in mandatory_identifiers and not partner_sudo._get_additional_identifier('AR_DNI'):
            order_sudo.alerts = alerts  # Drop the generic alert in favour of the specific one.
            order_sudo._add_warning_alert(self.env._(
                "Your order exceeds the maximum amount for an unidentified final consumer."
                " Please provide your identification number.",
            ))
        return href
