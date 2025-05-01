from odoo.tests import HttpCase, tagged


@tagged("-at_install", "post_install")
class TestSnippets(HttpCase):

    def test_sale_order_snippet(self):
        self.user = self.env['res.users'].create({
            'name': 'Test User',
            'login': 'test_user',
            'email': 'test@gmail.com',
        })
        sales_group = self.env.ref('sales_team.group_sale_salesman')
        self.user.write({'group_ids': [(4, sales_group.id)]})
        self.partner = self.env['res.partner'].create({
            'name': 'Test Partner',
            'email': 'test1@gmail.com',
        })
        template = self.env['product.template'].create({
            'name': 'Test Product',
            'list_price': 100.0,
        })
        self.product = template.product_variant_id
        for i in range(11):
            self.env['sale.order'].create({
                'partner_id': self.partner.id,
                'name': f'Test SO{i + 1}',
                'order_line': [(0, 0, {
                    'product_id': self.product.id,
                    'product_uom_qty': 1,
                    'price_unit': 100.0,
                })],
            })
        self.start_tour(self.env['website'].get_client_action_url('/'), 'sale_order_snippet', login='admin')
