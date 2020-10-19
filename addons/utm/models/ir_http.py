# -*- coding: utf-8 -*-
from odoo.http import request
from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    @classmethod
    def get_utm_domain_cookies(cls):
        return request.httprequest.host

    @classmethod
    def _set_utm(cls, response):
        if isinstance(response, Exception):
            return response
        # the parent dispatch might destroy the session
        if not request.db:
            return response

        domain = cls.get_utm_domain_cookies()
        for url_parameter, __, cookie_name in request.env['utm.mixin'].tracking_fields():
            if url_parameter in request.params and request.httprequest.cookies.get(cookie_name) != request.params[url_parameter]:
                response.set_cookie(cookie_name, request.params[url_parameter], domain=domain)
        return response

    @classmethod
    def _dispatch(cls):
        response = super(IrHttp, cls)._dispatch()
        return cls._set_utm(response)

    @classmethod
    def _handle_exception(cls, exc):
        response = super(IrHttp, cls)._handle_exception(exc)
        return cls._set_utm(response)
