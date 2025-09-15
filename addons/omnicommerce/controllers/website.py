from odoo import http
from odoo.http import request

class OmniCommerceWebsite(http.Controller):

    @http.route('/omnicommerce/signup', type='http', auth='public', methods=['GET'],  website=True)
    def omnicommerce_signup(self, **kw):
        """
        Renders the OmniCommerce signup page.
        The page will be managed by an OWL component.
        """
        return request.render('omnicommerce.omni_signup_page', {})
    
    @http.route('/omnicommerce/get_channels', type='jsonrpc', auth='public', methods=['POST'], website=True)
    def get_channels(self, **kw):
        try:
            channels = request.env['marketplace.channel'].sudo().search_read(
                [], ['id', 'name', 'code', 'type','image_128']  
            )

            # also get countries data
            countries = request.env['res.country'].sudo().search_read(
                [], ['id', 'name', 'code']
            )
            return {'status': 'success', 'channels': channels, 'countries': countries}
        except Exception as e:
            return {'status': 'error', 'error': str(e)}