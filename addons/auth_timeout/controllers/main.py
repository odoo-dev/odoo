from odoo import http
from odoo.http import request


class AuthTimeOutController(http.Controller):
    @http.route('/auth-timeout/check-identity', type='http', auth='public', website=True, sitemap=False)
    def check_identity(self, redirect=None):
        return request.render('auth_timeout.check_identity', {'redirect': redirect})

    @http.route('/auth-timeout/session/check-identity', type='json', auth='public', readonly=True)
    def check_identity_session(self, **kwargs):
        credential = kwargs
        request.env['res.users'].browse(request.session.uid)._check_credentials(credential, {'interactive': True})
        request.session.pop('next-check-identity', None)
