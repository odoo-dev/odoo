# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import os
import pathlib
import sys
import threading
from odoo import http
from odoo.http import request
from odoo.tools import config

_logger = logging.getLogger(__name__)

def get_db_name():
    dbnames = config['db_name']
    # If the database name is not provided on the command-line,
    # use the one on the thread (which means if it is provided on
    # the command-line, this will break when installing another
    # database from XML-RPC).
    if not dbnames and hasattr(threading.current_thread(), 'dbname'):
        return threading.current_thread().dbname
    if not dbnames:
        return 'default'
    if len(dbnames) > 1:
        sys.exit("-d/--database/db_name has multiple database, please provide a single one")
    return dbnames[0]

class TrackingReportController(http.Controller):

    def _get_file_path(self):
        db_name = get_db_name()
        folder = pathlib.Path(config['screenshots']) / db_name / 'screenshots'
        folder.mkdir(parents=True, exist_ok=True)
        return folder / 'templatesInfos.json'

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

        # report shape matches getThisTrackingReport():
        # { accesses: { compositeKey: { filename, templateName, property, xpath, expression, source } },
        #   getterAccesses: { compositeKey: { filename, templateName, getterName, property, source } } }

        data = {"accesses": {}, "getterAccesses": {}}
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                if not isinstance(data.get('accesses'), dict) or not isinstance(data.get('getterAccesses'), dict):
                    data = {"accesses": {}, "getterAccesses": {}}
            except Exception:
                data = {"accesses": {}, "getterAccesses": {}}

        existing_accesses = data.setdefault('accesses', {})
        for key, access in report.get('accesses', {}).items():
            if key in existing_accesses:
                if existing_accesses[key].get('source') != access.get('source'):
                    existing_accesses[key]['source'] = "both"
            else:
                existing_accesses[key] = access

        existing_getter = data.setdefault('getterAccesses', {})
        for key, ga in report.get('getterAccesses', {}).items():
            if key in existing_getter:
                if existing_getter[key].get('source') != ga.get('source'):
                    existing_getter[key]['source'] = "both"
            else:
                existing_getter[key] = ga

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
            return request.make_response(json.dumps({"accesses": {}, "getterAccesses": {}}), headers=[('Content-Type', 'application/json')])
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        return request.make_response(content, headers=[('Content-Type', 'application/json')])
