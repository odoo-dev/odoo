# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from odoo.http import route, request
from odoo import http

_logger = logging.getLogger(__name__)


class NeoLeapController(http.Controller):
    @route(['/payment/neoleap/return'], type='http', auth='public', csrf=False, save_session=False)
    def neoleap_return(self, **post):
        trandata_encrypted = post.get('trandata')
        if not trandata_encrypted:
            _logger.error("NeoLeap: Missing trandata in return callback.")
            return request.redirect('/payment/status')

        try:
            payment_tx = request.env['payment.transaction'].sudo().search([('provider_code', '=', 'neoleap')], limit=1)
            if not payment_tx:
                _logger.error("NeoLeap: No transaction found to fetch provider configuration.")
                return request.redirect('/payment/status')
            
            provider = payment_tx.provider_id
            try:
                decrypted_data = payment_tx._decrypt_trandata(trandata_encrypted, provider.neoleap_resource_key)
                _logger.info("NeoLeap Decrypted Return Data: %s", decrypted_data)
            except Exception as e:
                _logger.exception("NeoLeap Return: Failed to decrypt trandata.")
                return request.redirect('/payment/status')

            reference = decrypted_data[0]['trackId']
            if not reference:
                _logger.warning("NeoLeap: Missing trackId in decrypted data.")
                return request.redirect('/payment/status')

            ref_tx = request.env['payment.transaction'].sudo().search([('reference', '=', reference)], limit=1)
            if not ref_tx:
                _logger.warning("NeoLeap: No matching transaction found for reference %s", reference)
                return request.redirect('/payment/status')

            try:
                ref_tx._handle_notification_data('neoleap', decrypted_data)
            except Exception as e:
                _logger.exception("NeoLeap: Failed to handle feedback data for tx %s", ref_tx.reference)

        except Exception as e:
            _logger.exception("NeoLeap Return: Unexpected error occurred.")
            return request.redirect('/payment/status')

        return request.redirect('/payment/status')

    @route(['/payment/neoleap/error'], type='http', auth='public', csrf=False)
    def neoleap_error(self, **post):
        _logger.warning("NeoLeap: Error callback received. POST data: %s", post)
        return request.redirect('/payment/status')
