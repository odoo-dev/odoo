# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import os
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

class TrackingReportController(http.Controller):

    def _get_file_path(self):
        # addons/web/controllers/tracking_report.py -> addons/web/controllers -> addons/web -> addons -> root
        return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'templatesInfos.json'))

    @http.route('/sendThisReport', type='http', auth='none', methods=['POST'], csrf=False)
    def send_this_report(self):
        print("Received request for /sendThisReport")
        _logger.info("Received request for /sendThisReport")
        try:
            body = json.loads(request.httprequest.data)
        except Exception:
            _logger.error("Failed to parse JSON from request data")
            return request.make_response(json.dumps({"status": "error", "message": "Invalid JSON"}), headers=[('Content-Type', 'application/json')], status=400)

        report = body.get('params') or body
        if not report:
            _logger.error("No data found in request")
            return request.make_response(json.dumps({"status": "error", "message": "No data received"}), headers=[('Content-Type', 'application/json')], status=400)

        file_path = self._get_file_path()
        _logger.info("Saving report to %s", file_path)

        
        data = {}
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
            except Exception:
                data = {}

        # Combine templates
        new_templates = report.get('templates', {})
        for template_name, template_report in new_templates.items():
            if template_name in data:
                # Combine accesses and summary if needed
                # Here we just overwrite or merge. 
                # The user said "combine it to the previous one (if any) (per filename/template as unique key)"
                # Since template_name is the key, we merge them.
                existing = data[template_name]
                existing['accesses'] = existing.get('accesses', []) + template_report.get('accesses', [])
                # For summary, we might want to merge dictionaries
                existing_summary = existing.get('summary', {})
                new_summary = template_report.get('summary', {})
                for prop, source in new_summary.items():
                    prev_source = existing_summary.get(prop)
                    if not prev_source:
                        existing_summary[prop] = source
                    elif prev_source != source:
                        existing_summary[prop] = "both"
                existing['summary'] = existing_summary
            else:
                data[template_name] = template_report

        # Combine getterAccesses
        if 'getterAccesses' not in data:
            data['getterAccesses'] = []
        data['getterAccesses'].extend(report.get('getterAccesses', []))

        try:
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            return request.make_response(json.dumps({"status": "error", "message": str(e)}), headers=[('Content-Type', 'application/json')], status=500)

        return request.make_response(json.dumps({"status": "ok"}), headers=[('Content-Type', 'application/json')])

    @http.route('/getThisReport.json', type='http', auth='none', methods=['GET'], csrf=False)
    def get_this_report(self):
        file_path = self._get_file_path()
        if not os.path.exists(file_path):
            return request.make_response(json.dumps({}), headers=[('Content-Type', 'application/json')])
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        return request.make_response(content, headers=[('Content-Type', 'application/json')])
