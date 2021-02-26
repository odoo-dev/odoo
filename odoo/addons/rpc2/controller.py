# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import threading
import xmlrpc. client

import werkzeug.exceptions
import werkzeug.wrappers

from odoo import http, service, registry

from . import global_, database, model
from .marshaller import XMLRPCMarshaller, JSONMarshaller

logger = logging.getLogger(__name__)


class Rpc2(http.Controller):
    @http.route('/RPC2', auth='none', methods=['POST'], csrf=False)
    def rpc2_nodb(self):
        return self.rpc2(None)

    @http.route('/RPC2/<db>', auth='none', methods=['POST'], csrf=False)
    def rpc2(self, db):
        req = http.request.httprequest

        if req.mimetype == 'text/xml':
            marshaller = lambda result: (
                b"<?xml version='1.0'?>\n"
                b"<methodResponse>%s</methodResponse>\n" %
                    XMLRPCMarshaller('utf-8').dumps((result,))
            )
            try:
                params, method = xmlrpc.client.loads(req.stream.read())
                result = self.dispatch(db, method, params)
                response = marshaller(result)
            except NameError as e:
                response = marshaller(xmlrpc.client.Fault(
                    faultCode=xmlrpc.client.METHOD_NOT_FOUND,
                    faultString=str(e)
                ))
            except xmlrpc.client.Fault as f:
                response = marshaller(f)
            except Exception as e:
                response = service.wsgi_server.xmlrpc_convert_exception_int(e)
        elif req.mimetype == 'application/json':
            request = {}
            try:
                request = json.load(req.stream)
                assert 'id' in request, "Notification requests are not supported"
                result = self.dispatch(
                    db, request['method'], request.get('params', []))
                resp = {
                    'jsonrpc': '2.0',
                    'id': request['id'],
                    'result': result
                }
            except Exception as e:
                resp = {
                    'jsonrpc': '2.0',
                    'id': request.get('id'),
                    'error': {
                        # TODO: use XML-RPC fault codes from wsgi_server?
                        'code': 200,
                        'message': str(e),
                        'data': http.serialize_exception(e)
                    }
                }
            response = JSONMarshaller().encode(resp)
        else:
            return werkzeug.exceptions.UnsupportedMediaType(
                "%s mime type not supported by /RPC2, request may be either "
                "XML-RPC as text/xml or JSON-RPC 2.0 as application/json"
                % req.mimetype)

        return werkzeug.wrappers.Response(response, mimetype=req.mimetype)

    def dispatch(self, db, method, params):
        path = method.split('.')
        if not db:
            if len(path) != 1:
                raise NameError("{} is not a valid global method".format(method))
            [func] = path
            return global_.dispatch(func, *params)

        uid = None
        auth = http.request.httprequest.authorization
        if auth and auth.type == 'basic':
            uid = http.request.session.authenticate(db, auth.username, auth.password)

        if not uid:
            r = werkzeug.wrappers.Response(status=401)
            r.www_authenticate.set_basic("Odoo-RPC")
            raise werkzeug.exceptions.Unauthorized(response=r)

        threading.current_thread().uid = uid
        threading.current_thread().dbname = db


        r = registry(db).check_signaling()
        try:
            if len(path) == 1:
                return database.dispatch(r, uid, path[0], *params)
            else:
                model_name, func = method.rsplit('.', 1)
                return model.dispatch(r, uid, model_name, func, *params)
        finally:
            r.signal_changes()
