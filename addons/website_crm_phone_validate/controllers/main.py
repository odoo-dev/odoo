# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json

from odoo import http
from odoo.http import request

from odoo.addons.website_form.controllers.main import WebsiteForm


class WebsiteForm(WebsiteForm):

    def get_country(self):
        country_code = request.session.geoip and request.session.geoip.get('country_code') or False
        if country_code:
            return request.env['res.country'].sudo().search([('code', '=', country_code)], limit=1)
        return False

    # Check and insert values from the form on the model <model>
    @http.route('/website_form/<string:model_name>', type='http', auth="public", methods=['POST'], website=True)
    def website_form(self, model_name, **kwargs):
        model_record = request.env['ir.model'].sudo().search([('model', '=', model_name), ('website_form_access', '=', True)])
        if not model_record:
            return json.dumps(False)

        try:
            data = self.extract_data(model_record, request.params)
            record = data.get('record', {})
            contact_number = [record.get('phone'), record.get('mobile'), record.get('fax')]

            country = self.get_country()
            for cantact in contact_number:
                if cantact and hasattr(request.env[model_name], '_check_contact_number'):
                    request.env[model_name]._check_contact_number(cantact, country)
        # If we encounter an issue while extracting data
        except Exception as error:
            return json.dumps({'error_fields': error.args[0]})

        return super(WebsiteForm, self).website_form(model_name, **kwargs)
