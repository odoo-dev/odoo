import logging
import time

from odoo import models
from odoo.http import request, SessionExpiredException

ROUTES_NO_CHECK_IDENTITY = [
    ('odoo.addons.web.controllers.home', 'Home.web_load_menus'),
]


class CheckIdentityException(SessionExpiredException):
    # To log only with debug level in odoo/http.py Application.__call__
    loglevel = logging.DEBUG


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    @classmethod
    def _authenticate(cls, endpoint):
        super()._authenticate(endpoint)
        if (
            endpoint.routing['auth'] == "user"
            and (endpoint.__module__, endpoint.__qualname__) not in ROUTES_NO_CHECK_IDENTITY
        ):
            next_check_identity = request.session.get('next-check-identity')
            if next_check_identity and next_check_identity < time.time():
                raise CheckIdentityException(
                    f"User {request.session.uid} needs to renew authentication",
                    request.env.user._get_auth_methods(),
                )

    @classmethod
    def _handle_error(cls, exception):
        if request.dispatcher.routing_type == 'http' and isinstance(exception, CheckIdentityException):
            response = request.redirect_query(
                '/auth-timeout/check-identity',
                {'redirect': request.httprequest.full_path}
            )
            return response
        return super()._handle_error(exception)
