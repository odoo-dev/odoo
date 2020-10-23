# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from lxml import etree, objectify
from werkzeug import urls

from odoo import _, api, models
from odoo.exceptions import ValidationError

from . import const
from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_ogone.controllers.main import OgoneController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    @api.model
    def _compute_reference(self, provider, prefix=None, **kwargs):
        """ Override of payment to ensure that Ogone requirements for references are satisfied.

        Ogone requirements for references are as follows:
        - References must be unique at provider level for a given merchant account.
          This is satisfied by singularizing the prefix with the current datetime. If two
          transactions are created simultaneously, `_compute_reference` ensures the uniqueness of
          references by suffixing a sequence number.
        """
        if provider != 'ogone':
            return super()._compute_reference(provider, prefix=prefix, **kwargs)

        prefix = payment_utils.singularize_reference_prefix(prefix=prefix, max_length=40)
        return super()._compute_reference(provider, prefix=prefix, **kwargs)

    def _get_specific_rendering_values(self, processing_values):
        if self.acquirer_id.provider != 'ogone':
            return super()._get_specific_rendering_values(processing_values)

        base_url = self.acquirer_id._get_base_url()
        return_url = urls.url_join(base_url, OgoneController._flexcheckout_return_url)
        rendering_values = {
            'ACCOUNT_PSPID': self.acquirer_id.ogone_pspid,
            'ALIAS_ALIASID': payment_utils.singularize_reference_prefix(prefix='ODOO-ALIAS'),
            'ALIAS_ORDERID': processing_values.get('reference'),
            'ALIAS_STOREPERMANENTLY': 'Y' if self.tokenize else 'N',
            'CARD_PAYMENTMETHOD': 'CreditCard',
            'LAYOUT_LANGUAGE': self.partner_lang,
            'PARAMETERS_ACCEPTURL': return_url,
            'PARAMETERS_EXCEPTIONURL': return_url,
        }
        rendering_values.update({
            'SHASIGNATURE_SHASIGN': self.acquirer_id._ogone_generate_signature(
                rendering_values, incoming=False, format_keys=True
            ).upper(),
            'api_url': self.acquirer_id._ogone_get_api_url('flexcheckout'),
        })
        return rendering_values

    def _send_payment_request(self):
        super()._send_payment_request()  # Log the 'sent' message

        if self.provider != 'ogone':
            return

        tree = self._ogone_send_order_request()
        feedback_data = {
            'FEEDBACK_TYPE': 'directlink',
            'ORDERID': tree.get('orderID'),
            'tree': tree,
        }
        _logger.info(f"entering _handle_feedback_data with data:\n{pprint.pformat(feedback_data)}")
        self._handle_feedback_data('ogone', feedback_data)

    def _ogone_send_order_request(self, request_3ds_authentication=False):
        """ Make a new order request to Ogone and return the lxml etree parsed from the response.

        :param bool request_3ds_authentication: Whether a 3DS authentication should be requested if
                                                necessary to process the payment
        :return: The lxml etree
        :raise: ValidationError if the response can not be parsed to an lxml etree
        """
        base_url = self.acquirer_id.get_base_url()
        return_url = urls.url_join(base_url, OgoneController._directlink_return_url)
        data = {
            # DirectLink parameters
            'PSPID': self.acquirer_id.ogone_pspid,
            'ORDERID': self.reference,
            'USERID': self.acquirer_id.ogone_userid,
            'PSWD': self.acquirer_id.ogone_password,
            'AMOUNT': payment_utils.to_minor_currency_units(self.amount, None, 2),
            'CURRENCY': self.currency_id.name,
            'CN': self.partner_name or '',  # Cardholder Name
            'EMAIL': self.partner_email or '',
            'OWNERADDRESS': self.partner_address or '',
            'OWNERZIP': self.partner_zip or '',
            'OWNERTOWN': self.partner_city or '',
            'OWNERCTY': self.partner_country_id.code or '',
            'OWNERTELNO': self.partner_phone or '',
            'OPERATION': 'SAL',  # direct sale
            # Alias Manager parameters
            'ALIAS': self.token_id.acquirer_ref,
            'ALIASPERSISTEDAFTERUSE': 'Y' if self.token_id.active else 'N',
            'ECI': 9,  # Recurring (from eCommerce)
            # 3DS parameters
            'ACCEPTURL': return_url,
            'DECLINEURL': return_url,
            'EXCEPTIONURL': return_url,
            'LANGUAGE': self.partner_lang or 'en_US',
            'FLAG3D': 'Y' if request_3ds_authentication else 'N',
        }
        data['SHASIGN'] = self.acquirer_id._ogone_generate_signature(data, incoming=False)

        _logger.info(
            f"making payment request:\n"
            f"{pprint.pformat({k: v for k, v in data.items() if k != 'PSWD'})}"
        )  # Log the payment request data without the password
        response_content = self.acquirer_id._ogone_make_request('directlink', data)
        try:
            tree = objectify.fromstring(response_content)
        except etree.XMLSyntaxError:
            raise ValidationError("Ogone: " + "Received badly structured response from the API.")
        _logger.info(
            f"received payment request response as an etree:\n"
            f"{etree.tostring(tree, pretty_print=True, encoding='utf-8')}"
        )
        return tree

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        if provider != 'ogone':
            return super()._get_tx_from_feedback_data(provider, data)

        reference = data.get('ORDERID')
        tx = self.search([('reference', '=', reference)])
        if not tx:
            raise ValidationError("Ogone: " + _("No order found matching reference %s", reference))
        return tx

    def _process_feedback_data(self, data):
        if self.provider != 'ogone':
            return super()._process_feedback_data(data)

        feedback_type = data.get('FEEDBACK_TYPE')
        if feedback_type == 'flexcheckout':
            self._process_flexcheckout_data(data)
        elif feedback_type == 'directlink':
            self._process_directlink_data(data)
        else:
            raise ValidationError(
                "Ogone: " + _("Received feedback data with unknown type: %s", feedback_type)
            )

    def _process_flexcheckout_data(self, data):
        """ Create a token from Flexcheckout feedback data.

        :param dict data: The feedback data from Flexcheckout
        :return: None
        """
        token = self.env['payment.token'].create({
            'name': data.get('CARDNUMBER'),  # Already padded with 'X's
            'partner_id': self.partner_id.id,
            'acquirer_id': self.acquirer_id.id,
            'acquirer_ref': data['ALIASID'],
            'verified': False,  # No payment has been processed through this token yet
            'active': self.tokenize,  # Immediately archive the token if it was not requested
        })
        self.write({
            'token_id': token.id,
            'tokenize': False,
        })

    def _process_directlink_data(self, data):
        """ Update the transaction state and the acquirer reference based on the feedback data.

        :param dict data: The feedback data from DirectLink
        :return: None
        """
        if 'tree' in data:
            data = data['tree']
        self.acquirer_reference = data.get('PAYID')
        payment_status = int(data.get('STATUS', '0'))
        if payment_status in const.PAYMENT_STATUS_MAPPING['pending']:
            self._set_pending()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['done']:
            self.token_id.verified = True  # The payment has been authorized, the token is valid
            self._set_done()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['cancel']:
            self._set_canceled()
        else:  # Classify unknown payment statuses as `error` tx state
            _logger.info(f"received data with invalid payment status: {payment_status}")
            self._set_error(
                "Ogone: " + _("Received data with invalid payment status: %s", payment_status)
            )

    def _send_refund_request(self):
        self.ensure_one()
        if self.provider != 'ogone':
            return super()._send_refund_request()

        data = {
            'PSPID': self.acquirer_id.ogone_pspid,
            'ORDERID': self.reference,
            'PAYID': self.acquirer_reference,
            'USERID': self.acquirer_id.ogone_userid,
            'PSWD': self.acquirer_id.ogone_password,
            'AMOUNT': payment_utils.to_minor_currency_units(self.amount, None, 2),
            'CURRENCY': self.currency_id.name,
            'OPERATION': 'RFS',  # refund
        }
        data['SHASIGN'] = self.acquirer_id._ogone_generate_signature(data, incoming=False)

        _logger.info(
            f"making refund request:\n"
            f"{pprint.pformat({k: v for k, v in data.items() if k != 'PSWD'})}"
        )  # Log the refund request data without the password
        response_content = self.acquirer_id._ogone_make_request('maintenancedirect', data)
        try:
            tree = objectify.fromstring(response_content)
        except etree.XMLSyntaxError:
            raise ValidationError("Ogone: " + "Received badly structured response from the API.")
        _logger.info(
            f"received refund request response as an etree:\n"
            f"{etree.tostring(tree, pretty_print=True, encoding='utf-8')}"
        )
        feedback_data = {
            'FEEDBACK_TYPE': 'directlink',
            'ORDERID': tree.get('orderID'),
            'tree': tree,
        }
        _logger.info(f"entering _handle_feedback_data with data:\n{pprint.pformat(feedback_data)}")
        self._handle_feedback_data('ogone', feedback_data)
