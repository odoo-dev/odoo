from odoo.exceptions import ValidationError
from odoo.tests import Form, tagged

from odoo.addons.mrp_subcontracting.tests.common import TestMrpSubcontractingCommon


@tagged('post_install', '-at_install')
class TestSubcontractingLandedCosts(TestMrpSubcontractingCommon):

    def test_subcontracting_landed_cost_receipts_flow(self):
        """
            This test verifies that landed costs can be applied to subcontracting receipts
            rather than being added directly to the manufacturing order.
        """
        self.product_category.property_cost_method = 'fifo'
        self.product_category.property_valuation = 'real_time'
        po = self.env['purchase.order'].create({
            'partner_id': self.subcontractor_partner1.id,
            'order_line': [(0, 0, {
                'name': self.finished.name,
                'product_id': self.finished.id,
                'product_uom_qty': 10,
                'product_uom_id': self.finished.uom_id.id,
                'price_unit': 10,
            })],
        })
        po.button_confirm()

        mo = po.picking_ids.move_ids._get_subcontract_production()
        self.assertTrue(mo)

        in_picking = po.picking_ids
        in_picking.move_ids.quantity = 10
        in_picking.move_ids.picked = True
        in_picking.button_validate()

        # create a landed cost for the incoming picking
        default_vals = self.env['stock.landed.cost'].default_get(list(self.env['stock.landed.cost'].fields_get()))
        freight_charges = self.env['product.product'].create({
            'name': 'Freight Charges',
            'categ_id': self.product_category.id,
        })
        default_vals.update({
            'picking_ids': [in_picking.id],
            'cost_lines': [(0, 0, {
                'product_id': freight_charges.id,
                'name': 'equal split',
                'split_method': 'equal',
                'price_unit': 99,
            })],
        })
        stock_landed_cost = self.env['stock.landed.cost'].create(default_vals)

        # compute the landed cost using compute button
        stock_landed_cost.compute_landed_cost()

        # check the valuation adjustment lines
        for valuation in stock_landed_cost.valuation_adjustment_lines:
            if valuation.cost_line_id.name == 'equal split':
                self.assertEqual(valuation.former_cost, 100)
                self.assertEqual(valuation.additional_landed_cost, 99, 'Additional Landed Cost should be 99 instead of %s' % (valuation.additional_landed_cost))
                self.assertEqual(valuation.final_cost, 199)
            else:
                raise ValidationError('unrecognized valuation adjustment line')

        # confirm the landed cost
        stock_landed_cost.button_validate()
        self.assertEqual(stock_landed_cost.state, "done")

        # Value Distribution — finished
        #   ┌────────────────────────────────────────────┬────────┬────────────────────┐
        #   │ Move                                       │ Source │ Value Added        │
        #   ├────────────────────────────────────────────┼────────┼────────────────────┤
        #   │ Subcontracting → Stock (Receipt)           │ LC     │ +99.0   (landed)   │
        #   │ Production → Subcontracting (SBC)          │ MO     │ +100.0  (prod)     │
        #   └────────────────────────────────────────────┴────────┴────────────────────┘
        self.assertRecordValues(in_picking.move_ids | mo.move_finished_ids, [
            {'product_id': self.finished.id, 'quantity': 10.0, 'remaining_qty': 10.0, 'value': 99.0, 'remaining_value': 99.0},
            {'product_id': self.finished.id, 'quantity': 10.0, 'remaining_qty': 10.0, 'value': 100.0, 'remaining_value': 100.0},
        ])

        new_po = self.env['purchase.order'].create({
            'partner_id': self.subcontractor_partner1.id,
            'order_line': [(0, 0, {
                'name': self.finished.name,
                'product_id': self.finished.id,
                'product_uom_qty': 10,
                'product_uom_id': self.finished.uom_id.id,
                'price_unit': 10,
            })],
        })

        # The following checks ensure that the landed cost is distributed uniformly between standard product and subcontracting product
        product = self.env['product.product'].create({
            'name': 'Product',
            'is_storable': True,
            'categ_id': self.product_category.id,
        })
        with Form(new_po) as po_form:
            with po_form.order_line.new() as new_line:
                new_line.product_id = product
                new_line.product_qty = 10
                new_line.price_unit = 20
        new_po.button_confirm()

        new_mo = new_po.picking_ids.move_ids._get_subcontract_production()
        self.assertTrue(new_mo)

        in_picking = new_po.picking_ids
        in_picking.move_ids.quantity = 10
        in_picking.move_ids.picked = True
        in_picking.button_validate()

        # create a landed cost for the incoming picking
        default_vals = self.env['stock.landed.cost'].default_get(list(self.env['stock.landed.cost'].fields_get()))
        default_vals.update({
            'picking_ids': [in_picking.id],
            'cost_lines': [(0, 0, {
                'product_id': freight_charges.id,
                'name': 'equal split',
                'split_method': 'equal',
                'price_unit': 99,
            })],
        })
        stock_landed_cost = self.env['stock.landed.cost'].create(default_vals)

        # compute the landed cost using compute button
        stock_landed_cost.compute_landed_cost()

        # check the valuation adjustment lines
        self.assertEqual(len(stock_landed_cost.valuation_adjustment_lines), 2)
        for valuation in stock_landed_cost.valuation_adjustment_lines:
            if valuation.cost_line_id.name == 'equal split':
                self.assertEqual(valuation.additional_landed_cost, 49.5, 'Additional Landed Cost should be 49.5 instead of %s' % (valuation.additional_landed_cost))
            else:
                raise ValidationError('unrecognized valuation adjustment line')

        # confirm the landed cost
        stock_landed_cost.button_validate()
        self.assertEqual(stock_landed_cost.state, "done")

        # Value Distribution — finished
        #   ┌────────────────────────────────────────────────────────────┬────────┬────────────────────────┐
        #   │ Move                                                       │ Source │ Value Added            │
        #   ├────────────────────────────────────────────────────────────┼────────┼────────────────────────┤
        #   │ finished : Subcontracting → Stock (Receipt)                │ LC     │ +49.5       (landed)   │
        #   │ finished : Production → Subcontracting (SBC)               │ MO     │ +100.0      (prod)     │
        #   └────────────────────────────────────────────────────────────┴────────┴────────────────────────┘
        self.assertRecordValues(in_picking.move_ids.filtered(lambda m: m.product_id == self.finished) | new_mo.move_finished_ids, [
            {'product_id': self.finished.id, 'quantity': 10.0, 'remaining_qty': 10.0, 'value': 49.5, 'remaining_value': 49.5},
            {'product_id': self.finished.id, 'quantity': 10.0, 'remaining_qty': 10.0, 'value': 100.0, 'remaining_value': 100.0},
        ])

        # Value Distribution — product
        #   ┌────────────────────────────────────────────────────────────┬────────┬──────────────────────────────┐
        #   │ Move                                                       │ Source │ Value Added                  │
        #   ├────────────────────────────────────────────────────────────┼────────┼──────────────────────────────┤
        #   │ product : Vendor → Stock (Receipt)                         │ LC     │ +249.5  (PO + LC = 200+49.5) │
        #   └────────────────────────────────────────────────────────────┴────────┴──────────────────────────────┘
        self.assertRecordValues(in_picking.move_ids.filtered(lambda m: m.product_id == product), [
            {'product_id': product.id, 'quantity': 10.0, 'remaining_qty': 10.0, 'value': 249.5, 'remaining_value': 249.5},
        ])
