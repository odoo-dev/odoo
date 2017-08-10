# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.stock.tests.common2 import TestStockCommon


class PackingNeg(TestStockCommon):

    def test_00_packing_neg_flow(self):
        """ Test negative packaging with shipment. """

        # Create new product.
        product_neg = self.Product.create({
            'name': 'Negative product',
            'type': 'product',
            'categ_id': self.ref('product.product_category_1'),
            'list_price': 100.0,
            'standard_price': 70.0,
            'seller_ids': [(0, 0, {
                    'delay': 1,
                    'name': self.ref('base.res_partner_2'),
                    'min_qty': 2.0,
                })],
            })

        # Create an incoming picking for this product of 300 PCE from suppliers to stock
        piking_in = self.StockPicking.create({
            'name': 'Incoming picking (negative product)',
            "partner_id": self.ref("base.res_partner_4"),
            "picking_type_id": self.picking_type_in_id,
            'location_id': self.supplier_location_id,
            'location_dest_id': self.stock_location_id,
            })
        self._create_move(product_neg, self.supplier_location_id, self.stock_location_id, **{"product_uom_qty": 300, "picking_id": piking_in.id})

        # Confirm and assign picking and prepare partial
        piking_in.action_confirm()

        # Put 120 pieces on Packneg 1 (package), 120 pieces on Packneg 2 with lot A and 60 pieces on Packneg 3

        # create lot A
        lot_a = self.ProductionLot.create({'name': 'Lot neg', 'product_id': product_neg.id})

        # create package
        package1 = self.Package.create({'name': 'Packneg 1'})
        package2 = self.Package.create({'name': 'Packneg 2'})
        package3 = self.Package.create({'name': 'Packneg 3'})

        # Create package for each line and assign it as result_package_id
        # create pack operation
        piking_in.move_line_ids[0].write({'result_package_id': package1.id, 'qty_done': 120})
        self.StockMoveLine.create({
            'product_id': product_neg.id,
            'product_uom_id': self.uom_unit_id,
            'picking_id': piking_in.id,
            'lot_id': lot_a.id,
            'result_package_id': package2.id,
            'qty_done': 120,
            'location_id': self.supplier_location_id,
            'location_dest_id': self.stock_location_id
        })
        self.StockMoveLine.create({
          'product_id': product_neg.id,
          'product_uom_id': self.uom_unit_id,
          'picking_id': piking_in.id,
          'result_package_id': package3.id,
          'qty_done': 60,
          'location_id': self.supplier_location_id,
          'location_dest_id': self.stock_location_id
        })

        # Transfer the receipt
        piking_in.do_transfer()

        # Make a delivery order of 300 pieces to the customer
        delivery_order_neg = self.StockPicking.create({
                'name': 'Outgoin Picking (negative product)',
                'partner_id': self.ref('base.res_partner_4'),
                'picking_type_id': self.picking_type_out_id,
                'location_id': self.stock_location_id,
                'location_dest_id': self.customer_location_id,
        })
        self._create_move(product_neg, self.stock_location_id, self.customer_location_id, **{"product_uom_qty": 300.00, "picking_id": delivery_order_neg.id})

        # Assign and confirm
        delivery_order_neg.action_confirm()
        delivery_order_neg.action_assign()

        # Instead of doing the 300 pieces, you decide to take pallet 1 (do not mention product in operation here) and 140 pieces from lot A/pallet 2 and 10 pieces from pallet 3
        for rec in delivery_order_neg.move_line_ids:
            if rec.package_id.name == 'Packneg 1':
                rec.qty_done = rec.product_qty
            elif rec.package_id.name == 'Packneg 2' and rec.lot_id.name == 'Lot neg':
                rec.qty_done = 140
            elif rec.package_id.name == 'Packneg 3':
                rec.qty_done = 10
        # Process this picking
        delivery_order_neg.do_transfer()

        # Check the quants that you have 120 pieces pallet 1 in customers, -20 pieces pallet 2 in stock, 120 + 20 pieces 2 in customer with lot, and a total quantity of 50 in stock from pallet 3 (should be 20+30, as it has been split by reservation), finally 10 in customers from pallet 3
        self._check_the_quants(product_neg)

        # Create a picking for reconciling the negative quant
        delivery_reconcile = self.StockPicking.create({
                'name': 'reconciling_delivery',
                'partner_id': self.ref('base.res_partner_4'),
                'picking_type_id': self.picking_type_in_id,
                'location_id': self.supplier_location_id,
                'location_dest_id': self.stock_location_id,
        })
        self._create_move(product_neg, self.supplier_location_id, self.stock_location_id, **{"product_uom_qty": 20.00, "picking_id": delivery_reconcile.id})
        # Receive 20 products with lot neg in stock with a new incoming shipment that should be on pallet 2
        delivery_reconcile.action_confirm()
        delivery_reconcile.action_assign()
        delivery_reconcile.move_line_ids[0].write({'lot_id': lot_a.id, 'qty_done': 20.0, 'result_package_id': package2.id})
        delivery_reconcile.do_transfer()
        # Check the negative quant was reconciled and the 20 pieces of lot neg at customers have the incoming shipments in the history_ids
        neg_quants = self.env['stock.quant'].search([('product_id', '=', product_neg.id), ('quantity', '<', 0), ('location_id.id', '!=', self.supplier_location_id)])
        self.assertTrue(len(neg_quants) == 0, "Negative quants should have been reconciled")
        customer_quant = self.env['stock.quant'].search([
          ('product_id', '=', product_neg.id),
          ('location_id', '=', self.customer_location_id),
          ('lot_id', '=', lot_a.id),
          ('quantity', '=', 20)
        ])
        self.assertEqual(len(customer_quant), 0, "Wrong quant created for customer location.")

    def _check_the_quants(self, product):
        product_quants = self.StockQuant.search([('product_id', '=', product.id)])
        pallet_3_stock_qty = 0
        for quant in product_quants:
            if quant.package_id.name == 'Packneg 2' and quant.location_id.id == self.stock_location_id:
                self.assertTrue(quant.quantity - 20 != 120, "Should have -20 pieces in stock on pallet 2. Got %s" % quant.quantity)
            elif quant.package_id.name == 'Packneg 3' and quant.location_id.id == self.stock_location_id:
                pallet_3_stock_qty += quant.quantity
            else:
                self.assertNotEqual(quant.location_id.id, self.stock_location_id, "Unrecognized quant in stock")
        self.assertTrue(pallet_3_stock_qty == 50, "Should have 50 pieces in stock on pallet 3")
