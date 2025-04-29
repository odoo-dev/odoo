from odoo import http
from odoo.http import request

class WebsiteProduct(http.Controller):
    @http.route('/get_sale_order_snippet', auth="public", type='json', website=True)
    def get_sale_order(self, only_sale=False):
        domain = []
        if only_sale:
            domain.append(('state', '=', 'sale'))
        res = request.env['sale.order'].sudo().search_read(fields=['name','partner_id', 'state'], domain=domain)
        print(res)
        return res
