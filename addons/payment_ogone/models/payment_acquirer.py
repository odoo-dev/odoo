# coding: utf-8
import logging
import time
from hashlib import sha256
from werkzeug import urls

from odoo import api, fields, models, _
from odoo.addons.payment_ogone.controllers.main import OgoneController


_logger = logging.getLogger(__name__)


class PaymentAcquirer(models.Model):
    _inherit = 'payment.acquirer'

    provider = fields.Selection(selection_add=[
        ('ogone', 'Ogone')
    ], ondelete={'ogone': 'set default'})
    ogone_pspid = fields.Char('PSPID', required_if_provider='ogone', groups='base.group_user')
    ogone_userid = fields.Char('API User ID', required_if_provider='ogone', groups='base.group_user')
    ogone_password = fields.Char('API User Password', required_if_provider='ogone', groups='base.group_user')
    ogone_shakey_in = fields.Char('SHA Key IN', size=32, required_if_provider='ogone', groups='base.group_user')
    ogone_shakey_out = fields.Char('SHA Key OUT', size=32, required_if_provider='ogone', groups='base.group_user')

    def _get_validation_amount(self):
        """ Get the amount to transfer in a payment method validation operation.

        For an acquirer to support tokenization, it must override this method and return the amount
        to be transferred in a payment method validation operation.

        Note: self.ensure_one()

        :return: The validation amount
        :rtype: float
        """
        # fixme QUESTION TO ANV: the /my/payment_method should not say that a small amount will be taken from the card and refund after?
        # ogone says that the payment is accepted with the amount = 1. That could be missleading for the customer.
        self.ensure_one()
        return 1.0



    @api.model
    def _ogone_get_urls(self):
        """ Ogone URLS:
         - standard order: POST address for form-based """
        # https://ogone.test.v-psp.com/Tokenization/HostedPage
        # https://secure.ogone.com/Tokenization/HostedPage
        environment = 'prod' if self.state == 'enabled' else 'test'
        if environment == 'prod':
            flexcheckout_url = "https://secure.ogone.com/Tokenization/HostedPage"
            direct_order_url = "https://secure.ogone.com/ncol/prod/orderdirect.asp"
            maintenance_direct_url = "https://secure.ogone.com/ncol/prod/maintenancedirect.asp"
        else:
            flexcheckout_url = "https://ogone.test.v-psp.com/Tokenization/HostedPage"
            direct_order_url = "https://ogone.test.v-psp.com/ncol/test/orderdirect.asp"
            maintenance_direct_url = "https://ogone.test.v-psp.com/ncol/test/maintenancedirect.asp"
        return {
            'ogone_direct_order_url': direct_order_url,
            'ogone_flexcheckout_url': flexcheckout_url,
            'ogone_maintenance_url': maintenance_direct_url,
        }

    def _ogone_generate_shasign(self, inout, values):
        """ Generate the shasign for incoming or outgoing communications.

        :param string inout: 'in' (odoo contacting ogone) or 'out' (ogone
                             contacting odoo). In this last case only some
                             fields should be contained (see e-Commerce basic)
        :param dict values: transaction values

        :return string: shasign
        """
        assert inout in ('in', 'out')
        assert self.provider == 'ogone'
        key = getattr(self, 'ogone_shakey_' + inout)

        def filter_key(key):
            if inout == 'in':
                return True
            else:
                # SHA-OUT keys
                # source https://payment-services.ingenico.com/int/en/ogone/support/guides/integration guides/e-commerce/transaction-feedback
                keys = [
                    'AAVADDRESS',
                    'AAVCHECK',
                    'AAVMAIL',
                    'AAVNAME',
                    'AAVPHONE',
                    'AAVZIP',
                    'ACCEPTANCE',
                    'ALIAS',
                    'AMOUNT',
                    'BIC',
                    'BIN',
                    'BRAND',
                    'CARDNO',
                    'CCCTY',
                    'CN',
                    'COLLECTOR_BIC',
                    'COLLECTOR_IBAN',
                    'COMPLUS',
                    'CREATION_STATUS',
                    'CREDITDEBIT',
                    'CURRENCY',
                    'CVCCHECK',
                    'DCC_COMMPERCENTAGE',
                    'DCC_CONVAMOUNT',
                    'DCC_CONVCCY',
                    'DCC_EXCHRATE',
                    'DCC_EXCHRATESOURCE',
                    'DCC_EXCHRATETS',
                    'DCC_INDICATOR',
                    'DCC_MARGINPERCENTAGE',
                    'DCC_VALIDHOURS',
                    'DEVICEID',
                    'DIGESTCARDNO',
                    'ECI',
                    'ED',
                    'EMAIL',
                    'ENCCARDNO',
                    'FXAMOUNT',
                    'FXCURRENCY',
                    'IP',
                    'IPCTY',
                    'MANDATEID',
                    'MOBILEMODE',
                    'NBREMAILUSAGE',
                    'NBRIPUSAGE',
                    'NBRIPUSAGE_ALLTX',
                    'NBRUSAGE',
                    'NCERROR',
                    'ORDERID',
                    'PAYID',
                    'PAYIDSUB',
                    'PAYMENT_REFERENCE',
                    'PM',
                    'SCO_CATEGORY',
                    'SCORING',
                    'SEQUENCETYPE',
                    'SIGNDATE',
                    'STATUS',
                    'SUBBRAND',
                    'SUBSCRIPTION_ID',
                    'TICKET',
                    'TRXDATE',
                    'VC',
                ]
                # Source https://epayments-support.ingenico.com/en/integration/all-sales-channels/flexcheckout/guide#flexcheckout_integration_guides_sha_out
                flexcheckout_out = ['ALIAS.ALIASID',
                                    'ALIAS.NCERROR',
                                    'ALIAS.NCERRORCARDNO',
                                    'ALIAS.NCERRORCN',
                                    'ALIAS.NCERRORCVC',
                                    'ALIAS.NCERRORED',
                                    'ALIAS.ORDERID',
                                    'ALIAS.STATUS',
                                    'ALIAS.STOREPERMANENTLY',
                                    'CARD.BIC',
                                    'CARD.BIN',
                                    'CARD.BRAND',
                                    'CARD.CARDHOLDERNAME',
                                    'CARD.CARDNUMBER',
                                    'CARD.CVC',
                                    'CARD.EXPIRYDATE'
                                    ]
                keys += flexcheckout_out
                return key.upper() in keys

        items = sorted((k.upper(), v) for k, v in values.items())
        sign = ''.join('%s=%s%s' % (k, v, key) for k, v in items if v and filter_key(k.upper()))
        sign = sign.encode("utf-8")
        shasign = sha256(sign).hexdigest()
        return shasign

    def ogone_form_generate_values(self, values):
        """
        :param values: dict of Ogone values
        :return: dict of values ready to be url encoded
        """
        base_url = self.get_base_url()
        # The param_plus is a list of values that are not useful for the Ogone Alias creation but that we need to use
        # once we come back to our feedback endpoint. We need to do this because the endpoint is public and these values
        # are needed to continue the flow.
        param_plus = {
            'acquirerId': self.id,
            'partnerId': values.get('partner_id'),
            'currencyId': values.get('currency_id'),
            'orderId': values.get('order_id'),
            'amount': values.get('amount'),
            'paymentOptionId': values.get('param_plus').get('payment_option_id'),
            'referencePrefix': values.get('param_plus').get('reference_prefix'),
            'flow': values.get('param_plus').get('flow'),
            'landingRoute': values.get('param_plus').get('landing_route'),
            'initTxRoute': values.get('param_plus').get('init_tx_route'),
            'access_token': values.get('param_plus').get('access_token'),
        }
        if values.get('param_plus').get('isValidation'):
            # We set the validation key only if true otherwise javascript will receive isValidation = "False"
            # that will be parsed to true ¯\_(ツ)_/¯
            param_plus.update({'isValidation': True})
        if values.get('param_plus').get('validation_route'):
            # Set validation data
            # arj fixme: /my/payment_method has still some bugs with ingenico (data verification without 3ds and final redirect with 3ds)
            param_plus.update({'validationRoute': True})
            param_plus.update({'isValidation': True})

        ogone_tx_values = {
            'ACCOUNT.PSPID': self.ogone_pspid,
            'ALIAS.ORDERID': values['reference'],
            'LAYOUT.LANGUAGE': values.get('partner_lang'),
            'CARD.PAYMENTMETHOD': 'CreditCard',
            'PARAMETERS.ACCEPTURL': urls.url_join(base_url, OgoneController._fleckcheckout_url),
            'PARAMETERS.EXCEPTIONURL': urls.url_join(base_url, OgoneController._fleckcheckout_url),
            'ALIAS.ALIASID': 'ODOO-NEW-ALIAS-%s' % time.time(),  # something unique,
            'PARAMPLUS': urls.url_encode(param_plus),
        }
        shasign = self._ogone_generate_shasign('in', ogone_tx_values)
        ogone_tx_values['SHASIGNATURE.SHASIGN'] = shasign
        ogone_tx_values.update(ogone_tx_values)
        return ogone_tx_values

    def _ogone_setup_iframe(self, data):
        """
            Setup the ogone Iframe. The url and his GET parameters setup the form used by the client to enter his
            Credit card information.
        :param data: Ogone dict
        :return: string: the url of the Ogone IFRAME
        """
        ogone_values = self.ogone_form_generate_values(data)
        url_parameters = urls.url_encode(ogone_values)
        base_url = self._ogone_get_urls()['ogone_flexcheckout_url']
        full_checkout_url = base_url + '?' + url_parameters
        return full_checkout_url
