from types import SimpleNamespace
import json
from werkzeug.exceptions import Unauthorized
from werkzeug.datastructures import WWWAuthenticate

from odoo import http, sql_db
from odoo.addons.base.models.res_users import ResUsersApikeys


class WebKpiProviderController(http.Controller):
    @http.route('/json/2/kpi.provider/get_kpi_summary', type='json2', auth='nodb', csrf=False)
    def get_kpi_summary(self, database):
        request_headers = http.request.httprequest.headers
        if 'authorization' not in request_headers:
            raise Unauthorized('Missing "Authorization"', www_authenticate=WWWAuthenticate('bearer'))

        authorization = request_headers['authorization']
        if not authorization.lower().startswith('bearer '):
            raise Unauthorized('Use an API Key with a Bearer Authorization header.', www_authenticate=WWWAuthenticate('bearer'))

        apikey = authorization[7:]
        with sql_db.db_connect(database).cursor() as cr:
            uid = self._check_apikey(cr, apikey)
            if not uid:
                raise Unauthorized('Invalid apikey', www_authenticate=WWWAuthenticate('bearer'))

        return {'hello': 'world'}

    def _check_apikey(self, cr, apikey):
        env = SimpleNamespace(cr=cr)
        if not ResUsersApikeys._table:
            ResUsersApikeys._table = ResUsersApikeys._name.replace('.', '_')
        uid = ResUsersApikeys(env, [], [])._check_credentials(scope='rpc', key=apikey)
        return uid
