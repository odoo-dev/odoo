# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api
from odoo.addons import iap


class IapEnrichAPI(models.AbstractModel):
    _name = 'iap.enrich.api'
    _description = 'IAP Lead Enrichment API'
    _DEFAULT_ENDPOINT = 'https://iap-services.odoo.com'

    @api.model
    def _contact_iap(self, local_endpoint, params):
        account = self.env['iap.account'].get('reveal')
        dbuuid = self.env['ir.config_parameter'].sudo().get_param('database.uuid')
        params['account_token'] = account.account_token
        params['dbuuid'] = dbuuid
        return iap.jsonrpc(self._DEFAULT_ENDPOINT + local_endpoint, params=params, timeout=300)

    @api.model
    def _request_enrich(self, lead_emails):
        """ Contact endpoint to get enrichment data.

        :param lead_emails: dict{lead_id: email}
        :return: dict{lead_id: company data or False}
        :raise: several errors, notably
          * InsufficientCreditError: {
            "credit": 4.0,
            "service_name": "reveal",
            "base_url": "https://iap.odoo.com/iap/1/credit",
            "message": "You don't have enough credits on your account to use this service."
            }
        """
        params = {
            'domains': lead_emails,
        }
        response = self._contact_iap('/iap/clearbit/2/lead_enrichment_email', params=params)
        if response.get('error') == 'insufficient_credit':
            raise iap.InsufficientCreditError()
        return response
