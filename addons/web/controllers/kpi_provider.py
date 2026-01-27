from types import SimpleNamespace

from werkzeug.datastructures import WWWAuthenticate
from werkzeug.exceptions import Unauthorized

from odoo import sql_db
from odoo.http import Controller, request, route

from .. import kpi_provider
from .utils import ensure_db
from odoo.addons.base.models.res_users import ResUsersApikeys


class WebKpiProviderController(Controller):
    @route('/kpi.provider/get_kpi_summary', type='json2', db=False)
    def get_kpi_summary(self):
        ensure_db()
        apikey = self._get_apikey()
        with sql_db.db_connect(request.db).cursor() as cr:
            uid = self._check_apikey(cr, apikey)
            return kpi_provider.get_kpi_summary(cr, uid)

    def _get_apikey(self):
        request_headers = request.httprequest.headers
        if 'authorization' not in request_headers:
            e = 'Missing "Authorization"'
            raise Unauthorized(e, www_authenticate=WWWAuthenticate('bearer'))
        authorization = request_headers['authorization']
        if not authorization.lower().startswith('bearer '):
            e = "Use an API Key with a Bearer Authorization header."
            raise Unauthorized(e, www_authenticate=WWWAuthenticate('bearer'))
        return authorization[7:]

    def _check_apikey(self, cr, apikey):
        env = SimpleNamespace(cr=cr)
        if not ResUsersApikeys._table:
            ResUsersApikeys._table = ResUsersApikeys._name.replace('.', '_')
        uid = ResUsersApikeys(env, [], [])._check_credentials(scope='rpc', key=apikey)
        if not uid:
            e = "Invalid apikey"
            raise Unauthorized(e, www_authenticate=WWWAuthenticate('bearer'))
        return uid  # noqa: RET504
