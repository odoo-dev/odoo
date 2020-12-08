# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import datetime
import logging
import re
import time
from pprint import pformat

import requests
from lxml import etree, objectify
from werkzeug import urls

from odoo import _, api, fields, models
from odoo.http import request
from odoo.tools import ustr
from odoo.tools.float_utils import float_repr, float_round

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment.models.payment_acquirer import ValidationError
from odoo.addons.payment_ogone.controllers.main import OgoneController
from . import const

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    # TODO ANV what are these fields used for?
    ogone_html_3ds = fields.Char(string="3D Secure HTML")
    ogone_user_error = fields.Char(string="User Friendly State message")

    def _get_specific_processing_values(self, processing_values):
        if self.acquirer_id.provider != 'ogone':
            return super()._get_specific_rendering_values(processing_values)

        return processing_values

    def _get_specific_rendering_values(self, processing_values):
        if self.acquirer_id.provider != 'ogone':
            return super()._get_specific_processing_values(processing_values)
        partner_id = self.env['res.partner'].browse(processing_values.get('partner_id'))
        base_url = self.acquirer_id._get_base_url()
        return_url = urls.url_join(base_url, OgoneController._fleckcheckout_url)
        form_values = {'tx_url': self.acquirer_id._ogone_get_urls()['ogone_flexcheckout_url'],}
        ogone_sign_values = {
            'ACCOUNT.PSPID': self.acquirer_id.ogone_pspid,
            'ALIAS.ORDERID': processing_values.get('reference'),
            'aliasid': 'ODOO-NEW-ALIAS-%s' % time.time(),  # something unique,
            'LAYOUT.LANGUAGE': partner_id.lang,
            'CARD.PAYMENTMETHOD': 'CreditCard',
            'PARAMETERS.ACCEPTURL': return_url,
            'PARAMETERS.EXCEPTIONURL': return_url,
            'PARAMPLUS': {
                'acquirerId': processing_values.get('acquirer_id'),
                'partnerId': processing_values.get('partner_id'),
                'currencyId': processing_values.get('currency_id'),
                'amount': processing_values.get('amount', 0),
            },
        }
        shasign = self.acquirer_id._ogone_generate_shasign('in', ogone_sign_values,)
        ogone_sign_values['SHASIGNATURE.SHASIGN'] = shasign
        form_values.update(ogone_sign_values)
        return form_values

    # --------------------------------------------------
    # BUSINESS METHODS
    # --------------------------------------------------

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

        prefix = prefix and payment_utils.singularize_reference_prefix(prefix=prefix)
        return super()._compute_reference(provider, prefix=prefix, **kwargs)

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        """
        Given a data dict coming from ogone, verify it and find the related
        transaction record. Create a payment token if an alias is returned.

        This method is called from two different API: Flexcheckout for token (Alias) creation on Ingenico servers
        and from the DirectLink API when a 3DSV1 verification occurs (with redirection).
        Unfortunately, these two API don't share the same keywords and conventions.

        At this point, the data signature has been validated and we can homogenize the data.
        :param str provider: The provider of the acquirer that handled the transaction
        :param dict data: The feedback data sent by the acquirer
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        """
        if provider != 'ogone':
            return super()._get_tx_from_feedback_data(provider, data)

        if data.get('TYPE') == 'flexcheckout':
            alias = data['ALIASID']
            reference = data.get('REFERENCE')
            # pay_id is not present when returning from fleckcheckout because we just created an alias.
            # Therefore, this field is not blocking
            pay_id = True
        else:
            alias = data.get('ALIAS')
            # type is directlink
            pay_id = data.get('PAYID')
            reference = data.get('ORDERID')

        data_checked = alias and reference and pay_id
        if not data_checked:
            raise ValidationError(_("Ogone: received data with missing values (%s) (%s)", reference, alias))

        tx = self.search([('reference', '=', reference)])
        if not tx:
            raise ValidationError(_("Ogone: no order found matching reference %s", reference))
        return tx

    def _process_feedback_data(self, data):
        """ Update the transaction state and the acquirer reference based on the feedback data.
        For an acquirer to handle transaction post-processing, it must overwrite this method and
        process the feedback data.

        Note: self.ensure_one()

        :param dict data: The feedback data sent by the acquirer
        :return: None
        """
        self.ensure_one()
        if self.provider != 'ogone':
            return super()._process_feedback_data(data)

        self._ogone_ncerrors_verification(data)
        if all(key in data for key in ['CARDNUMBER', 'CARDHOLDERNAME']) and data.get('TYPE') == 'flexcheckout':
            # First case: # We are coming back from the flexcheckout API
            # The token (alias) was created on the Ogone server, we create it here before performing the payment request
            token_vals = {
                'acquirer_id': self.acquirer_id.id,
                'acquirer_ref': data['ALIAS'],
                'partner_id': self.partner_id.id,
                'name': '%s - %s' % (data.get('CARDNUMBER')[-4:], data.get('CARDHOLDERNAME')),
                'verified': False
            }
            if data.get('STOREPERMANENTLY') == 'N':
                # The token shall not be reused, we archive it to avoid listing it
                token_vals.update({'active': False})
            token = self.env['payment.token'].create(token_vals)
            self.write({'token_id': token.id})
        else:
            # Second case: we are coming back from the Direct link API with a 3DS redirection
            status = int(data.get('STATUS', '0'))
            if status in const.PAYMENT_STATUS_MAPPING['done']:
                self.write({'acquirer_reference': data.get('PAYID')})
                if self.token_id:
                    self.token_id.verified = True
                    self._set_done()
            elif status in const.PAYMENT_STATUS_MAPPING['cancel']:
                self._set_canceled()
            elif status in const.PAYMENT_STATUS_MAPPING['wait'] \
                    or status in const.PAYMENT_STATUS_MAPPING['pending']:
                self._set_pending()
            else:  # There was probably an NCERROR
                _logger.error("could not validate these data for:\n%s", pformat(data))  # TODO ANV check if data aren't logged twice
                self._set_canceled()

    def _send_payment_request(self):
        super()._send_payment_request()  # Log the 'sent' message
        if self.provider != 'ogone':
            return
        acquirer = self.acquirer_id
        # FIXME VFE can we have a falsy ref at this point ?
        reference = self.reference or "ODOO-%s-%s" % (datetime.datetime.now().strftime('%y%m%d_%H%M%S'), self.partner_id.id)
        base_url = acquirer.get_base_url()
        data = {
            'PSPID': acquirer.ogone_pspid,
            'USERID': acquirer.ogone_userid,
            'PSWD': acquirer.ogone_password,
            'ORDERID': reference,
            'AMOUNT': float_repr(float_round(self.amount, 2) * 100, 0),
            'CURRENCY': self.currency_id.name,
            'OPERATION': 'SAL',
            'ECI': 9,   # Recurring (from eCommerce)
            'ALIAS': self.token_id.acquirer_ref,
            'RTIMEOUT': 30,
            'EMAIL': self.partner_id.email or '',
            'CN': self.partner_id.name or '',
            'ACCEPTURL': urls.url_join(base_url, OgoneController._accept_url),
            'DECLINEURL': urls.url_join(base_url, OgoneController._decline_url),
            'EXCEPTIONURL': urls.url_join(base_url, OgoneController._exception_url),
            'CANCELURL': urls.url_join(base_url, OgoneController._cancel_url),
            'HOMEURL': urls.url_join(base_url, OgoneController._fleckcheckout_final_url),
            'CATALOGURL': urls.url_join(base_url, OgoneController._fleckcheckout_final_url),
        }
        # arj fixme: check if these values can be used to trigger a 3dsv2
        # ogone_tx_values = {
        #     'LANGUAGE': values.get('partner_lang'),
        #     'CN': values.get('partner_name'),
        #     'EMAIL': values.get('partner_email'),
        #     'OWNERZIP': values.get('partner_zip'),
        #     'OWNERADDRESS': values.get('partner_address'),
        #     'OWNERTOWN': values.get('partner_city'),
        #     'OWNERCTY': values.get('partner_country') and values.get('partner_country').code or '',
        # }
        data.update({
            'FLAG3D': 'Y',
            'LANGUAGE': self.partner_id.lang or 'en_US',
            # FIXME VFE incoherent language acquisition: partner or en here, context or EN in other places
            'WIN3DS': 'MAINW',
        })
        if request:
            data['REMOTE_ADDR'] = request.httprequest.remote_addr
        data['SHASIGN'] = acquirer._ogone_generate_shasign(data, incoming=True)

        direct_order_url = acquirer._ogone_get_urls()['ogone_direct_order_url']

        logged_data = data.copy()
        logged_data.pop('PSWD')
        _logger.info("ogone_payment_request: Sending values to URL %s, values:\n%s", direct_order_url, pformat(logged_data))
        result = requests.post(direct_order_url, data=data).content

        try:
            tree = objectify.fromstring(result)
        except etree.XMLSyntaxError:
            # invalid response from ogone
            _logger.exception('Invalid xml response from ogone')
            _logger.info('ogone_payment_request: Values received:\n%s', result)
            raise

        _logger.info('ogone_payment_request: Values received:\n%s', etree.tostring(tree, pretty_print=True, encoding='utf-8'))
        return self._ogone_validate_tree(tree)

    def _send_refund_request(self, **kwargs):
        if self.provider != 'ogone':
            return super()._send_refund_request(**kwargs)
        acquirer = self.acquirer_id
        # FIXME VFE can we really have a falsy reference at this point ?
        reference = self.reference #or "ODOO-%s-%s" % (datetime.datetime.now().strftime('%y%m%d_%H%M%S'), self.partner_id.id)
        data = {
            'PSPID': acquirer.ogone_pspid,
            'USERID': acquirer.ogone_userid,
            'PSWD': acquirer.ogone_password,
            'ORDERID': reference,
            'AMOUNT': int(self.amount * 100),
            'CURRENCY': self.currency_id.name,
            'OPERATION': 'RFS',
            'PAYID': self.acquirer_reference,
        }
        data['SHASIGN'] = acquirer._ogone_generate_shasign(data, incoming=True)
        refund_order_url = acquirer._ogone_get_urls()['ogone_maintenance_url']

        logged_data = data.copy()
        logged_data.pop('PSWD')
        _logger.info("ogone_s2s_do_refund: Sending values to URL %s, values:\n%s", refund_order_url, pformat(logged_data))
        result = requests.post(refund_order_url, data=data).content

        try:
            tree = objectify.fromstring(result)
        except etree.XMLSyntaxError:
            # invalid response from ogone
            _logger.exception('Invalid xml response from ogone')
            _logger.info('ogone_s2s_do_refund: Values received:\n%s', result)
            self.state_message = str(result)
            raise

        _logger.info('ogone_s2s_do_refund: Values received:\n%s', etree.tostring(tree, pretty_print=True, encoding='utf-8'))
        return self._ogone_validate_tree(tree)

    # --------------------------------------------------
    # OGONE API RELATED METHODS
    # --------------------------------------------------

    @api.model
    def _ogone_clean_keys(self, data):  # TODO ANV rename
        """ Clean dict keys for coherence with directlink API.

        The dict keys are different from one API to another but the correct keys are needed.
        """
        # to check the signature...
        # 1) Pass keys to uppercase
        # 2) Remove prefix with the dot line "CARD."; "ALIAS." etc
        return {re.sub(r'.*\.', '', key.upper()): val for key, val in data.items()}

    def _ogone_ncerrors_verification(self, data):
        """
        Check that the incoming data coming from the FlexCheckout API are correct.
        :param data: GET parameters of the feedback URL
        :return: None
        """
        # check for errors before using values
        errors = {k: int(v) for k, v in data.items() if k.startswith('NCError') and int(v)}
        if errors:
            self._set_canceled()
            error_fields = ", ".join([const.FLEXCHECKOUT_ERROR[key] for key in errors.keys()])
            error_msg = "Ogone: " + _(f"The following parameters could not be validated by Ogone: {error_fields}.")
            raise ValidationError(error_msg)

    def _ogone_validate_tree(self, tree, tries=2):
        if self.state not in ['draft', 'pending']:
            _logger.info('Ogone: trying to validate an already validated tx (ref %s)', self.reference)
            return True

        status = int(tree.get('STATUS') or 0)
        if status in const.PAYMENT_STATUS_MAPPING['done']:
            self.write({'acquirer_reference': tree.get('PAYID')})
            if self.token_id:
                self.token_id.verified = True
            self._set_done()
            return True
        elif status in const.PAYMENT_STATUS_MAPPING['cancel']:
            self.write({'acquirer_reference': tree.get('PAYID')})
            self._set_canceled()
            # TODO VFE return False ?
        elif status in const.PAYMENT_STATUS_MAPPING['pending']:
            vals = {
                'acquirer_reference': tree.get('PAYID'),
            }
            if status == 46: # HTML 3DS
                vals['ogone_html_3ds'] = ustr(base64.b64decode(tree.HTML_ANSWER.text))
            self.write(vals)
            self._set_pending()
            return False
        elif status in const.PAYMENT_STATUS_MAPPING['wait'] and tries > 0:
            time.sleep(0.5)
            self.write({'acquirer_reference': tree.get('PAYID')})
            tree = self._ogone_api_get_tx_status()
            return self._ogone_validate_tree(tree, tries - 1)
        else:
            error = 'Ogone: feedback error: %(error_str)s\n\n%(error_code)s: %(error_msg)s' % {
                'error_str': tree.get('NCERRORPLUS'),
                'error_code': tree.get('NCERROR'),
                'error_msg': const.OGONE_ERROR_MAP.get(tree.get('NCERROR')),
            }

            _logger.info(error)
            self.write({
                'state_message': error,
                'acquirer_reference': tree.get('PAYID'),
                'ogone_user_error':  const.OGONE_ERROR_MAP.get(tree.get('NCERROR')),
            })
            self._set_canceled()
            return False

    def _ogone_api_get_tx_status(self):
        account = self.acquirer_id
        #reference = tx.reference or "ODOO-%s-%s" % (datetime.datetime.now().strftime('%Y%m%d_%H%M%S'), tx.partner_id.id)
        data = {
            'PAYID': self.acquirer_reference,
            'PSPID': account.ogone_pspid,
            'USERID': account.ogone_userid,
            'PSWD': account.ogone_password,
        }

        # TODO move this url logic on the acquirer model
        query_direct_url = 'https://secure.ogone.com/ncol/%s/querydirect.asp' % ('prod' if self.acquirer_id.state == 'enabled' else 'test')

        logged_data = data.copy()
        logged_data.pop('PSWD')

        _logger.info("_ogone_api_get_tx_status: Sending values to URL %s, values:\n%s", query_direct_url, pformat(logged_data))
        result = requests.post(query_direct_url, data=data).content

        try:
            tree = objectify.fromstring(result)
        except etree.XMLSyntaxError:
            # invalid response from ogone
            _logger.exception('Invalid xml response from ogone')
            _logger.info('_ogone_api_get_tx_status: Values received:\n%s', result)
            raise

        _logger.info('_ogone_api_get_tx_status: Values received:\n%s', etree.tostring(tree, pretty_print=True, encoding='utf-8'))
        return tree
