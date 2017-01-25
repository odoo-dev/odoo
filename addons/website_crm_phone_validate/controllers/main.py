# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json

from odoo import http
from odoo.http import request

from odoo.addons.website_form.controllers.main import WebsiteForm


class WebsiteForm(WebsiteForm):

    # Check and insert values from the form on the model <model>
    @http.route('/website_form/<string:model_name>', type='http', auth="public", methods=['POST'], website=True)
    def website_form(self, model_name, **kwargs):
        model_record = request.env['ir.model'].sudo().search([('model', '=', model_name), ('website_form_access', '=', True)])
        if not model_record:
            return json.dumps(False)

        try:
            data = self.extract_data(model_record, request.params)
            phone = data.get('record').get('phone')
            if phone and hasattr(request.env[model_name], '_check_phone'):
                request.env[model_name]._check_phone(phone)
        # If we encounter an issue while extracting data
        except Exception as error:
            return json.dumps({'error_fields': error.args[0]})

        return super(WebsiteForm, self).website_form(model_name, **kwargs)
