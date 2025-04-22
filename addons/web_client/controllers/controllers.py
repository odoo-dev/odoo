from odoo import http
from odoo.http import request


class WebCorePlayground(http.Controller):
    @http.route(['/next'], type='http', auth='public')
    def show_playground(self):
        """
        Renders the web_core playground page
        """
        context = request.env['ir.http'].webclient_rendering_context()
        return request.render('web_client.playground', qcontext=context)