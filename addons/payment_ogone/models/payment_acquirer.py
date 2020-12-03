# coding: utf-8

import logging
import time
from hashlib import sha256

from werkzeug import urls

from odoo import api, fields, models

from odoo.addons.payment_ogone.controllers.main import OgoneController
from . import const

_logger = logging.getLogger(__name__)


class PaymentAcquirer(models.Model):
    _inherit = 'payment.acquirer'

    provider = fields.Selection(
        selection_add=[('ogone', "Ogone")], ondelete={'ogone': 'set default'})
    ogone_pspid = fields.Char(
        string="PSPID", required_if_provider='ogone', groups='base.group_system')
    ogone_userid = fields.Char(
        string="API User ID", required_if_provider='ogone', groups='base.group_system')
    ogone_password = fields.Char(
        string="API User Password", required_if_provider='ogone', groups='base.group_system')
    ogone_shakey_in = fields.Char(
        string="SHA Key IN", size=32, required_if_provider='ogone', groups='base.group_system')
    ogone_shakey_out = fields.Char(
        string="SHA Key OUT", size=32, required_if_provider='ogone', groups='base.group_system')

    def _get_validation_amount(self):
        """ Get the amount to transfer in a payment method validation operation.

        :return: The validation amount
        :rtype: float
        """
        if self.provider != 'ogone':
            return super()._get_validation_amount()
        return 1.0

    def _ogone_generate_shasign(self, values, incoming=True):
        """ Generate the shasign for incoming or outgoing communications.

        :param dict values: The values used to generate the signature
        :param bool incoming: Whether the signature must be generate for an incoming (ogone to odoo)
                              or outgoing (odoo to ogone) communication.
        :return: The shasign
        :rtype: str
        """
        key = self.ogone_shakey_in if incoming else self.ogone_shakey_out
        sorted_sign_items = sorted((k.upper(), v) for k, v in values.items())
        # For outgoing communications, only some fields must be included (see e-Commerce basic)
        filtered_sign_items = [(k, v) for k, v in sorted_sign_items
                               if v and (incoming or k in const.VALID_KEYS)]
        sign_string = ''.join(f'{k}={v}{key}' for k, v in filtered_sign_items)
        sign = sign_string.encode('utf-8')
        return sha256(sign).hexdigest()

    def _ogone_setup_iframe(self, data):  # TODO ANV review this + rename
        """ Setup the ogone Iframe.

        The url and its GET parameters setup the form used by the client to enter his payment
        details.

        :param data: Ogone dict  # TODO ANV
        :return: The url of the Ogone iframe
        :rtype: str
        """
        # VFE FIXME one clear url_join with all the params ?
        ogone_values = self._ogone_form_generate_values(data)
        url_parameters = urls.url_encode(ogone_values)
        base_url = self._ogone_get_urls()['ogone_flexcheckout_url']
        full_checkout_url = base_url + '?' + url_parameters
        return full_checkout_url

    def _ogone_form_generate_values(self, values):  # TODO ANV review this
        """

        :param dict values: The Ogone values  # TODO ANV what kind of values?
        :return: The values ready to be url encoded
        :rtype: dict
        """
        base_url = self.get_base_url()
        # The param_plus is a list of values that are not useful for the Ogone Alias creation but that we need to use
        # once we come back to our feedback endpoint. We need to do this because the endpoint is public and these values
        # are needed to continue the flow.
        additional_params = values.get('param_plus', dict())
        param_plus = {  # TODO ANV yet another 'param_plus' ?
            'acquirerId': self.id,
            'partnerId': values.get('partner_id'),
            'currencyId': values.get('currency_id'),
            'orderId': values.get('order_id'),
            'amount': values.get('amount'),
            'paymentOptionId': additional_params.get('payment_option_id'),
            'referencePrefix': additional_params.get('reference_prefix'),
            'flow': additional_params.get('flow'),
            'landingRoute': additional_params.get('landing_route'),
            'transactionRoute': additional_params.get('transaction_route'),
            'access_token': additional_params.get('access_token'),
        }
        if additional_params.get('isValidation'):
            # We set the validation key only if true otherwise javascript will receive isValidation = "False"
            # that will be parsed to true ¯\_(ツ)_/¯
            param_plus.update({'isValidation': True})
        if additional_params.get('validation_route'):
            # Set validation data
            # arj fixme: /my/payment_method has still some bugs with ingenico (data verification without 3ds and final redirect with 3ds)
            param_plus.update({'validationRoute': True})
            param_plus.update({'isValidation': True})

        return_url = urls.url_join(base_url, OgoneController._fleckcheckout_url)
        ogone_tx_values = {
            'ACCOUNT.PSPID': self.ogone_pspid,
            'ALIAS.ORDERID': values['reference'],
            'LAYOUT.LANGUAGE': values.get('partner_lang'),
            'CARD.PAYMENTMETHOD': 'CreditCard',
            'PARAMETERS.ACCEPTURL': return_url,
            'PARAMETERS.EXCEPTIONURL': return_url,
            'ALIAS.ALIASID': 'ODOO-NEW-ALIAS-%s' % time.time(),  # something unique,
            'PARAMPLUS': urls.url_encode(param_plus),
        }
        shasign = self._ogone_generate_shasign(ogone_tx_values, incoming=True)
        ogone_tx_values['SHASIGNATURE.SHASIGN'] = shasign
        # ogone_tx_values.update(ogone_tx_values) # FIXME VFE strange code...
        return ogone_tx_values

    @api.model
    def _ogone_get_urls(self):
        # standard order: POST address for form-based
        if self.state == 'enabled':
            return {
                'ogone_flexcheckout_url': 'https://secure.ogone.com/Tokenization/HostedPage',
                'ogone_direct_order_url': 'https://secure.ogone.com/ncol/prod/orderdirect.asp',
                'ogone_maintenance_url': 'https://secure.ogone.com/ncol/prod/maintenancedirect.asp',
            }
        else:  # 'test'
            return {
                'ogone_flexcheckout_url': 'https://ogone.test.v-psp.com/Tokenization/HostedPage',
                'ogone_direct_order_url': 'https://ogone.test.v-psp.com/ncol/test/orderdirect.asp',
                'ogone_maintenance_url': 'https://ogone.test.v-psp.com/ncol/test'
                                         '/maintenancedirect.asp',
            }
