# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.exceptions import UserError
from odoo.tests import Form
from odoo.addons.stock_account.tests.test_stockvaluation import _create_accounting_data
from odoo.addons.stock_account.tests.test_stockvaluationlayer import TestStockValuationCommon


class TestStockValuationLayerRevaluation(TestStockValuationCommon):
    @classmethod
    def setUpClass(cls):
        super(TestStockValuationLayerRevaluation, cls).setUpClass()
        cls.stock_input_account, cls.stock_output_account, cls.stock_valuation_account, cls.expense_account, cls.income_account, cls.stock_journal = _create_accounting_data(cls.env)
        cls.product1.write({
            'property_account_expense_id': cls.expense_account.id,
        })
        cls.stock_valuation_account.account_stock_expense_id = cls.expense_account
        cls.product1.categ_id.write({
            'property_valuation': 'real_time',
            'property_stock_valuation_account_id': cls.stock_valuation_account.id,
            'property_stock_journal': cls.stock_journal.id,
        })

        cls.product1.categ_id.property_valuation = 'real_time'
        cls.env.company.account_stock_journal_id = cls.stock_journal

    def _get_close_stock_valuation(self):
        account_move_line = self.env['account.move'].browse(self.env.company.action_close_stock_valuation()['res_id']).line_ids
        return account_move_line.filtered(lambda ml: ml.account_id in [self.stock_valuation_account, self.expense_account])

    def test_stock_valuation_layer_revaluation_avco(self): 
        self.product1.categ_id.property_cost_method = 'average'

        self._make_in_move(self.product1, 10, unit_cost=2)
        move = self._make_in_move(self.product1, 10, unit_cost=4)

        self.assertEqual(self.product1.standard_price, 3)
        self.assertEqual(self.product1.qty_available, 20)
        self.assertEqual(move.value, 40)

        move.value_manual = 60

        # Check standard price change
        self.assertEqual(self.product1.standard_price, 4)
        self.assertEqual(self.product1.qty_available, 20)

        # Check the value of move and product
        self.assertEqual(move.value, 60)
        self.assertEqual(move.remaining_value, 60)
        self.assertEqual(self.product1.total_value, 80)

        # Check account move
        account_move_line = self._get_close_stock_valuation()
        self.assertTrue(bool(account_move_line))
        self.assertEqual(len(account_move_line), 2)

        self.assertRecordValues(account_move_line,
            [
                {'account_id': self.expense_account.id, 'credit': 80.0, 'debit': 0.0},
                {'account_id': self.stock_valuation_account.id, 'credit': 0.0, 'debit': 80.0},
            ])

        credit_lines = [l for l in account_move_line if l.credit > 0]
        self.assertEqual(len(credit_lines), 1)
        self.assertEqual(credit_lines[0].account_id.id, self.expense_account.id)

    def test_stock_valuation_layer_revaluation_avco_rounding(self): 
        self.product1.categ_id.property_cost_method = 'average'

        self._make_in_move(self.product1, 1, unit_cost=1)
        self._make_in_move(self.product1, 1, unit_cost=1)
        move = self._make_in_move(self.product1, 1, unit_cost=1)

        self.assertEqual(self.product1.standard_price, 1)
        self.assertEqual(self.product1.qty_available, 3)
        self.assertEqual(move.value, 1)

        move.value_manual = 2

        # Check standard price change
        self.assertEqual(self.product1.standard_price, 1.33)
        self.assertEqual(self.product1.qty_available, 3)

        # Check the value of move and product
        self.assertEqual(move.value, 2)
        self.assertEqual(move.remaining_value, 2)
        self.assertEqual(self.product1.total_value, 4)

        # Check account move
        account_move_line = self._get_close_stock_valuation()
        self.assertTrue(bool(account_move_line))
        self.assertEqual(len(account_move_line), 2)

        self.assertRecordValues(account_move_line,
            [
                {'account_id': self.expense_account.id, 'credit': 4.0, 'debit': 0.0},
                {'account_id': self.stock_valuation_account.id, 'credit': 0.0, 'debit': 4.0},
            ])

        credit_lines = [l for l in account_move_line if l.credit > 0]
        self.assertEqual(len(credit_lines), 1)
        self.assertEqual(credit_lines[0].account_id.id, self.expense_account.id)

    def test_stock_valuation_layer_revaluation_avco_rounding_2_digits(self): 
        """
        Check that the rounding of the new price (cost) is equivalent to the rounding of the standard price (cost)
        The check is done indirectly via the layers valuations.
        If correct => rounding method is correct too
        """
        self.product1.categ_id.property_cost_method = 'average'

        self.env['decimal.precision'].search([
            ('name', '=', 'Product Price'),
        ]).digits = 2
        self.product1.write({'standard_price': 0})

        # First Move
        self.product1.write({'standard_price': 0.022})
        move1 = self._make_in_move(self.product1, 10000)

        self.assertEqual(self.product1.standard_price, 0.02)
        self.assertEqual(self.product1.qty_available, 10000)
        self.assertEqual(move1.value, 200)

        # Second Move
        self.product1.write({'standard_price': 0.053})

        self.assertEqual(self.product1.standard_price, 0.05)
        self.assertEqual(self.product1.qty_available, 10000)

        move2 = self._make_in_move(self.product1, 10000)
        self.assertEqual(move2.value, 500)
        self.assertEqual(self.product1.total_value, 700)

    def test_stock_valuation_layer_revaluation_avco_rounding_5_digits(self): 
        """
        Check that the rounding of the new price (cost) is equivalent to the rounding of the standard price (cost)
        The check is done indirectly via the layers valuations.
        If correct => rounding method is correct too
        """
        self.product1.categ_id.property_cost_method = 'average'

        self.env['decimal.precision'].search([
            ('name', '=', 'Product Price'),
        ]).digits = 5

        # First Move
        self.product1.write({'standard_price': 0.00875})
        move = self._make_in_move(self.product1, 10000)

        self.assertEqual(self.product1.standard_price, 0.00875)
        self.assertEqual(self.product1.qty_available, 10000)

        self.assertEqual(move.value, 87.5)

        # Second Move
        self.product1.write({'standard_price': 0.00975})

        self.assertEqual(self.product1.standard_price, 0.00975)
        self.assertEqual(self.product1.qty_available, 10000)

        move1 = self._make_in_move(self.product1, 10000)
        self.assertEqual(move1.value, 97.5)
        self.assertEqual(self.product1.total_value, 185.0)

    def test_stock_valuation_layer_revaluation_fifo(self): 
        self.product1.categ_id.property_cost_method = 'fifo'

        self._make_in_move(self.product1, 10, unit_cost=2)
        move = self._make_in_move(self.product1, 10, unit_cost=4)

        self.assertEqual(self.product1.standard_price, 3)
        self.assertEqual(self.product1.qty_available, 20)
        self.assertEqual(move.value, 40)

        move.value_manual = 60

        self.assertEqual(self.product1.standard_price, 4)
        self.assertEqual(move.value, 60)
        self.assertEqual(self.product1.total_value, 80)

        # Check account move
        account_move_line = self._get_close_stock_valuation()
        self.assertTrue(bool(account_move_line))
        self.assertEqual(len(account_move_line), 2)

        self.assertRecordValues(account_move_line,
            [
                {'account_id': self.expense_account.id, 'credit': 80.0, 'debit': 0.0},
                {'account_id': self.stock_valuation_account.id, 'credit': 0.0, 'debit': 80.0},
            ])

        credit_lines = [l for l in account_move_line if l.credit > 0]
        self.assertEqual(len(credit_lines), 1)
        self.assertEqual(credit_lines[0].account_id.id, self.expense_account.id)

    def test_stock_valuation_layer_revaluation_partial(self): 
        """ Only adjust the valuation on some of the layers for a product """
        self.product1.categ_id.property_cost_method = 'fifo'

        product2 = self.env['product.product'].create({
            'name': 'product2',
            'is_storable': True,
        })

        self._make_in_move(self.product1, 5, unit_cost=4)
        self._make_in_move(self.product1, 10, unit_cost=4)
        move1 = self._make_in_move(self.product1, 5, unit_cost=8)
        self._make_in_move(product2, 10, unit_cost=4)

        self.assertEqual(self.product1.standard_price, 5)
        self.assertEqual(self.product1.qty_available, 20)

        moves = self.env['stock.move'].search([('product_id', '=', self.product1.id)], order="create_date desc, id desc")

        self.assertEqual(moves.mapped("remaining_value"), [40, 40, 20])

        move1.value_manual = 70

        # Check standard price change
        self.assertEqual(self.product1.standard_price, 6.5)
        self.assertEqual(self.product1.qty_available, 20)
        self.assertEqual(move1.value, 70)
        self.assertEqual(moves.mapped("remaining_value"), [70, 40, 20])

        # Check account move
        account_move_line = self._get_close_stock_valuation()
        self.assertTrue(bool(account_move_line))
        self.assertEqual(len(account_move_line), 2)

        self.assertRecordValues(account_move_line,
            [
                {'account_id': self.expense_account.id, 'credit': 130.0, 'debit': 0.0},
                {'account_id': self.stock_valuation_account.id, 'credit': 0.0, 'debit': 130.0},
            ])

        credit_lines = [l for l in account_move_line if l.credit > 0]
        self.assertEqual(len(credit_lines), 1)
        self.assertEqual(credit_lines[0].account_id.id, self.expense_account.id)

    def test_multi_company_fifo_svl_negative_revaluation(self):
        """
        Check that the journal entries are created for the company related
        to the stock move even if the picking is validated using a different one.
        """
        company1 = self.env.company
        company2 = self.env['res.company'].create({
            'name': 'Lovely Company',
        })
        self.env.companies = company1 | company2

        product = self.product1
        product.categ_id.write({
            'property_cost_method': 'fifo',
            'property_valuation': 'real_time',
        })
        # Modify valuation to manual_periodic for company2
        product.categ_id.with_company(company2).property_valuation = 'periodic'

        # Create moves to revaluate for company1
        self._make_in_move(product, 10, unit_cost=10, create_picking=True)
        self._make_out_move(product, 15, create_picking=True)

        receipt = self.env['stock.picking'].create({
            'picking_type_id': self.picking_type_in.id,
            'location_id': self.supplier_location.id,
            'location_dest_id': self.stock_location.id,
            'move_ids': [Command.create({
                'product_id': product.id,
                'location_id': self.supplier_location.id,
                'location_dest_id': self.stock_location.id,
                'product_uom': self.uom_unit.id,
                'product_uom_qty': 10,
                'price_unit': 7,
            })]
        }).with_company(company2)
        receipt.action_confirm()
        receipt.button_validate()

        data = self.env.company.action_close_stock_valuation()
        self.assertTrue(data, "account moves should be created")
