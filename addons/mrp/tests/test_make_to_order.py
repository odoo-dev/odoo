# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import Form, tagged
from odoo.addons.mrp.tests.common import TestMrpCommon


@tagged('post_install', '-at_install')
class TestForecastMakeToOrder(TestMrpCommon):
    """ The "Make to Order" alert of the forecasted report, opened from a component of
    a manufacturing order: the component is manufactured on order. """

    def test_manufacture_missing_component(self):
        Product = self.env['product.product'].sudo()
        component, part, finished = Product.create([
            {'name': 'Leg', 'is_storable': True},
            {'name': 'Wood', 'is_storable': True},
            {'name': 'Table', 'is_storable': True},
        ]).with_env(self.env)
        self.env['mrp.bom'].sudo().create([{
            'product_tmpl_id': component.product_tmpl_id.id,
            'bom_line_ids': [(0, 0, {'product_id': part.id, 'product_qty': 1})],
        }, {
            'product_tmpl_id': finished.product_tmpl_id.id,
            'bom_line_ids': [(0, 0, {'product_id': component.id, 'product_qty': 4})],
        }])
        mo_form = Form(self.env['mrp.production'])
        mo_form.product_id = finished
        mo_form.product_qty = 2
        mo = mo_form.save()
        mo.action_confirm()
        raw_move = mo.move_raw_ids
        self.assertEqual(raw_move.product_uom_qty, 8)

        report = self.env['stock.forecasted_product_product']
        shortages = report.with_context(move_to_match_ids=raw_move.ids)._get_report_data(product_ids=component.ids)['make_to_order']
        self.assertEqual(len(shortages), 1)
        self.assertEqual(shortages[0]['quantity'], 8)
        self.assertEqual(shortages[0]['document'], mo.name)

        report.action_make_to_order(raw_move.id, shortages[0]['quantity'])
        component_mo = raw_move.move_orig_ids.production_id
        self.assertEqual(component_mo.product_id, component)
        self.assertEqual(component_mo.product_qty, 8)
        self.assertEqual(raw_move.procure_method, 'make_to_order')
        self.assertEqual(mo.move_raw_ids, raw_move)
