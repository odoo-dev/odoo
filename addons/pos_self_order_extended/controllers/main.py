from odoo import http
from odoo.http import request
import json


class PosReceipt(http.Controller):
    @http.route("/pos/receipt", auth="public", type="http", website=True, sitemap=False)
    def pos_receipt(self, **kwargs):
        errors = {}
        orders = []
        form_values = {}
        if request.httprequest.method == 'POST':
            if not kwargs.get('contact_number'):
                errors['contact_number'] = True
            else:
                form_values['contact_number'] = kwargs.get('contact_number')
                server_orders = request.env['pos.order'].sudo().search_read(
                    [('contact_number', '=', kwargs.get('contact_number'))],
                    ['id', 'pos_reference', 'tracking_number', 'date_order']
                )
                orders = []
                for order in server_orders:
                    orders.append({
                        'id': order['id'],
                        'pos_reference': order['pos_reference'],
                        'tracking_number': order['tracking_number'],
                        'date_order': order['date_order'],
                        'order_obj': json.dumps(request.env['pos.order'].sudo().browse(order['id']).get_order_data()),
                    })

        return request.render("pos_self_order_extended.receipt", {
            'errors': errors,
            'orders': orders,
            'form_values': form_values,
        })
