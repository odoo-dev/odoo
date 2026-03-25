from odoo.tests.common import HttpCase, tagged


@tagged("-at_install", "post_install")
class TestStockWarehouseOrderpoint(HttpCase):

    def test_product_replenishment(self):
        product = self.env['product.product'].create({
            'name': 'Book Shelf',
            'lst_price': 1750.00,
            'is_storable': True,
            'purchase_ok': True,
        })
        self.assertFalse(product.orderpoint_ids)

        self.start_tour("/odoo/replenishment", "test_product_replenishment", login='admin')

        self.assertEqual(len(product.orderpoint_ids), 1)
        self.assertEqual(product.orderpoint_ids[0].route_id.name, 'Buy')

    def test_replenishment_supplier_multicompany_access(self):
        uom_unit = self.env.ref('uom.product_uom_unit')
        partner = self.env['res.partner'].create({'name': 'Partner A'})
        company_a = self.env.company
        company_b = self.env['res.company'].create({'name': 'Company B'})
        product = self.env['product.product'].create({
            'name': 'Product A',
            'is_storable': True,
        })
        for company, price in [(company_a, 10.0), (company_b, 20.0)]:
            self.env['product.supplierinfo'].create({
                'partner_id': partner.id,
                'product_id': product.id,
                'company_id': company.id,
                'price': price,
            })
        self.env['stock.warehouse.orderpoint'].create({
            'product_id': product.id,
            'product_min_qty': 5.0,
            'product_max_qty': 5.0,
            'company_id': company_a.id,
        })
        self.start_tour('/odoo/replenishment', 'test_replenishment_supplier_multicompany_access', login='admin')
