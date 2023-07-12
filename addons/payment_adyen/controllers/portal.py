# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.payment.controllers import portal as payment_portal
from odoo.addons.payment_adyen.const import PAYMENT_METHODS_MAPPING


class PaymentPortal(payment_portal.PaymentPortal):

    def _get_extra_payment_form_values(self, **kwargs):
        """ Override of `payment` to add Adyen's payment method mapping to the payment form values.
        """
        form_values = super()._get_extra_payment_form_values(**kwargs)
        form_values['adyen_payment_methods_mapping'] = PAYMENT_METHODS_MAPPING
        return form_values
