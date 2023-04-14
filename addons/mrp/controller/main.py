# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
import logging

from werkzeug.urls import url_encode

from odoo import http
from odoo.http import request
from odoo.tools.translate import _

logger = logging.getLogger(__name__)


class MrpDocumentRoute(http.Controller):

    @http.route('/mrp/manufacturing', type='http', auth="user")
    def route_to_display_productions_and_workorders(self):
        action = request.env.ref('mrp.action_mrp_display')
        get_params_string = url_encode({'action': action.id})
        return request.redirect(f'/web?#{get_params_string}')

    @http.route('/mrp/upload_attachment', type='http', methods=['POST'], auth="user")
    def upload_document(self, ufile, **kwargs):
        files = request.httprequest.files.getlist('ufile')
        result = {'success': _("All files uploaded")}
        for ufile in files:
            try:
                mimetype = ufile.content_type
                request.env['mrp.document'].create({
                    'name': ufile.filename,
                    'res_model': kwargs.get('res_model'),
                    'res_id': int(kwargs.get('res_id')),
                    'mimetype': mimetype,
                    'datas': base64.encodebytes(ufile.read()),
                })
            except Exception as e:
                logger.exception("Fail to upload document %s" % ufile.filename)
                result = {'error': str(e)}

        return json.dumps(result)
