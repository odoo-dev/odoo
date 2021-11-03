# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models
from odoo.http import request


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    @classmethod
    def get_utm_domain_cookies(cls):
        return request.httprequest.host

    @classmethod
    def _set_utm(cls):
        domain = cls.get_utm_domain_cookies()
        for var, _, cook in request.env['utm.mixin'].tracking_fields():
            if var in request.params and request.httprequest.cookies.get(var) != request.params[var]:
                request.future_response.set_cookie(cook, request.params[var], domain=domain)

    @classmethod
    def _dispatch(cls, endpoint):
        # cannot override _pre_dispatch() as _set_utm() requires the
        # params from the request's body.
        cls._set_utm()
        return super()._dispatch(endpoint)
