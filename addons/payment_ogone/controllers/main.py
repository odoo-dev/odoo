# -*- coding: utf-8 -*-

import logging
import pprint

import werkzeug

from odoo import _, http
from odoo.http import request

_logger = logging.getLogger(__name__)


class OgoneController(http.Controller):
    _accept_url = '/payment/ogone/accept'
    _decline_url = '/payment/ogone/ogonedecline'
    _exception_url = '/payment/ogone/exception'
    _cancel_url = '/payment/ogone/cancel'
    _fleckcheckout_url = '/payment/ogone/flexchekout/feedback'
    _fleckcheckout_final_url = "/payment/ogone/flexchekout/final"

    @http.route('/payment/ogone/payment_setup', type='json', auth='public')
    def payment_setup(self, acquirer_id, amount=None, currency_id=None, partner_id=None, **data):
        """ Build the URL of the iframe of the FlexCheckout API with all necessary parameters.

        See https://epayments-support.ingenico.com/en/integration-solutions/integrations/hosted-payment-page

        :param int acquirer_id: The acquirer handling the transaction, as a `payment.acquirer` id
        :param float amount: The transaction amount
        :param int currency_id: The transaction currency, as a `res.currency` id
        :param int partner_id: The partner making the transaction, as a `res.partner` id
        :param data: the param_plus values used to generate the iframe URL
        :return: The JSON-formatted content of the response
        :rtype: dict
        """
        acquirer_sudo = request.env['payment.acquirer'].sudo().browse(acquirer_id)
        currency = request.env['res.currency'].browse(currency_id)
        partner_sudo = request.env['res.partner'].browse(partner_id).sudo()
        partner_country_code = partner_sudo and partner_sudo.country_id.code  # TODO ANV does it need to be None or just falsy ?
        lang_code = request.context.get('lang', 'en-US').replace('_', '-')  # TODO VFE fallback on partner.lang ?
        shopper_reference = partner_sudo and f'ODOO_PARTNER_{partner_sudo.id}'
        form_data = {
            'amount': amount,
            'currency': currency,
            'countryCode': partner_country_code,
            'partner_lang': lang_code,  # IETF language tag (e.g.: 'fr-BE')
            'partner_name': partner_sudo.name,
            'reference': shopper_reference,
            'partner_id': partner_id,
            'currency_id': currency_id,
            'param_plus': data,
        }
        return {
            'ogone_iframe_url': acquirer_sudo._ogone_setup_iframe(form_data),
            'acquirer_id': acquirer_id
        }

    @http.route(['/payment/ogone/flexchekout/feedback', '/payment/ogone/flexchekout/final'],
                type='http', auth='public', csrf=False, method=['GET', 'POST'],
                website=True)
    def ogone_iframe_feedback(self, **kwargs):
        """
            Handle both redirection from Ingenico in the iframe
                First after the FlexcheckoutAPI has created the Alias
                Secondly Once the send_payment_request has had the 3DS verification.
        """
        _logger.info('Ogone: entering flexcheckout feedback with data %s', pprint.pformat(kwargs))
        return request.render("payment_ogone.feedback", kwargs)

    @http.route(['/payment/ogone/payments'], type='json', auth='public', csrf=False)
    def ogone_process_payments(self, **data):
        """ Make a payment request and handle the response.
        :return: The JSON-formatted content of the response
        :rtype: dict
        """
        acquirer_sudo = request.env['payment.acquirer'].sudo().browse(data.get('acquirer_id'))
        shasign_check = acquirer_sudo._ogone_generate_shasign(data['ogone_values'], incoming=False)
        if shasign_check.upper() != data['ogone_values'].get('SHASign'):
            # The data could not be verified
            _logger.info(
                "Ogone: invalid shasign, received %s, computed %s, for data %s",
                data['ogone_values'].get('SHASign'), shasign_check, pprint.pformat(data['ogone_values']))
            return {'ogone_user_error': _("The transaction signature could not be verified")}
        data['ogone_values']['BROWSERACCEPTHEADER'] = request.httprequest.headers.environ['HTTP_ACCEPT']
        PaymentTransaction = request.env['payment.transaction'].sudo()
        ogone_data = PaymentTransaction._ogone_clean_keys(data['ogone_values'])
        tx_sudo = PaymentTransaction._handle_feedback_data('ogone', ogone_data)
        if tx_sudo.token_id:
            tx_sudo._send_payment_request()
            return {'tx_status': tx_sudo.state, 'html_3ds': tx_sudo.ogone_html_3ds,
                    'ogone_user_error': tx_sudo.ogone_user_error}
        else:
            _logger.error(
                "The payment token could not be created from data:\n%s", pprint.pformat(data)
            )
            return {'ogone_user_error': _("The payment token could not be created.")}

    @http.route([
        '/payment/ogone/accept',
        '/payment/ogone/decline',
        '/payment/ogone/exception',
        '/payment/ogone/cancel',
    ], type='http', auth='public', csrf=False, method=['GET', 'POST'])
    def ogone_transaction_feedback(self, **post):
        """ Handle redirection from Ingenico (GET) and s2s notification (POST/GET) """
        _logger.info('Ogone: entering transaction server to server feedback with post data %s', pprint.pformat(post))
        post['type'] = 'directlink'
        PaymentTransaction = request.env['payment.transaction'].sudo()
        ogone_data = PaymentTransaction._ogone_clean_keys(post)
        # We validate the data before parsing them
        # FIXME VFE what if there are 3 ogone acquirers for same company but different countries and journals ???
        # FIXME is there a way to know through the ogone_data which acquirer was chosen earlier in the flow?
        acquirer_sudo = request.env['payment.acquirer'].sudo().search([('provider', '=', 'ogone')], limit=1)
        shasign_check = acquirer_sudo._ogone_generate_shasign(ogone_data, incoming=False)
        if shasign_check.upper() != post.get('SHASIGN'):
            _logger.error(
                'Ogone: invalid shasign, received %s, computed %s, for data %s',
                post.get('SHASIGN'), shasign_check, pprint.pformat(post)
            )

        # The data matches, we can handle them
        PaymentTransaction._handle_feedback_data('ogone', ogone_data)

        # ARJ todo: investigations
        # When coming back from the 3dsv1 authentication, Ogone don't use HTTPS. It triggers an error if the Odoo instance
        # is hosted behind a reverse proxy with https. Ongoing investigations...
        fleckcheckout_back_url = werkzeug.urls.url_join(acquirer_sudo.get_base_url(), self._fleckcheckout_final_url)
        return werkzeug.utils.redirect(fleckcheckout_back_url)
