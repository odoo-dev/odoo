# from odoo import http


# class SaleUnicommerce(http.Controller):
#     @http.route('/sale_unicommerce/sale_unicommerce', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/sale_unicommerce/sale_unicommerce/objects', auth='public')
#     def list(self, **kw):
#         return http.request.render('sale_unicommerce.listing', {
#             'root': '/sale_unicommerce/sale_unicommerce',
#             'objects': http.request.env['sale_unicommerce.sale_unicommerce'].search([]),
#         })

#     @http.route('/sale_unicommerce/sale_unicommerce/objects/<model("sale_unicommerce.sale_unicommerce"):obj>', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('sale_unicommerce.object', {
#             'object': obj
#         })

