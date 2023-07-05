# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo import Command
from odoo.tests import tagged

from odoo.addons.project.tests.test_project_profitability import TestProjectProfitabilityCommon
from odoo.addons.purchase.tests.test_purchase_invoice import TestPurchaseToInvoiceCommon
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tools.float_utils import float_compare


@tagged('-at_install', 'post_install')
class TestProjectPurchaseProfitability(TestProjectProfitabilityCommon, TestPurchaseToInvoiceCommon, AccountTestInvoicingCommon):

    def test_bills_without_purchase_order_are_accounted_in_profitability_project_purchase(self):
        """
        A bill that has an AAL on one of its line should be taken into account
        for the profitability of the project.
        The contribution of the line should only be dependent
        on the project's analytic account % that was set on the line
        """
        # a custom analytic contribution (number between 1 -> 100 included)
        analytic_distribution = 42
        analytic_contribution = analytic_distribution / 100.
        # create a bill_1 with the AAL
        bill_1 = self.env['account.move'].create({
            "name": "Bill_1 name",
            "move_type": "in_invoice",
            "state": "draft",
            "partner_id": self.partner.id,
            "invoice_date": datetime.today(),
            "invoice_line_ids": [Command.create({
                "analytic_distribution": {self.analytic_account.id: analytic_distribution},
                "product_id": self.product_a.id,
                "quantity": 1,
                "product_uom_id": self.product_a.uom_id.id,
                "price_unit": self.product_a.standard_price,
                "currency_id": self.env.company.currency_id.id,
            })],
        })
        # add 2 new AAL to the analytic account. Those costs must be present in the cost data
        self.env['account.analytic.line'].create([{
            'name': 'extra costs 1',
            'account_id': self.analytic_account.id,
            'amount': -50,
        }, {
            'name': 'extra costs 2',
            'account_id': self.analytic_account.id,
            'amount': -100,
        }])
        self.maxDiff = None
        # the bill_1 is in draft, therefore it should have the cost "to_bill" same as the -product_price (untaxed)
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'other_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_costs'],
                    'to_bill': 0.0,
                    'billed': -150.0,
                }, {
                    'id': 'other_purchase_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'],
                    'to_bill': -self.product_a.standard_price * analytic_contribution,
                    'billed': 0.0,
                }],
                'total': {'to_bill': -self.product_a.standard_price * analytic_contribution, 'billed': -150.0},
            },
        )
        # post bill_1
        bill_1.action_post()
        # we posted the bill_1, therefore the cost "billed" should be -product_price, to_bill should be back to 0
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'other_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_costs'],
                    'to_bill': 0.0,
                    'billed': -150.0,
                }, {
                    'id': 'other_purchase_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'],
                    'to_bill': 0.0,
                    'billed': -self.product_a.standard_price * analytic_contribution,
                }],
                'total': {'to_bill': 0.0, 'billed': -self.product_a.standard_price * analytic_contribution - 150},
            },
        )
        # create another bill, with 2 lines, 2 diff products, the second line has 2 as quantity
        bill_2 = self.env['account.move'].create({
            "name": "I have 2 lines",
            "move_type": "in_invoice",
            "state": "draft",
            "partner_id": self.partner.id,
            "invoice_date": datetime.today(),
            "invoice_line_ids": [Command.create({
                "analytic_distribution": {self.analytic_account.id: analytic_distribution},
                "product_id": self.product_a.id,
                "quantity": 1,
                "product_uom_id": self.product_a.uom_id.id,
                "price_unit": self.product_a.standard_price,
                "currency_id": self.env.company.currency_id.id,
            }), Command.create({
                "analytic_distribution": {self.analytic_account.id: analytic_distribution},
                "product_id": self.product_b.id,
                "quantity": 2,
                "product_uom_id": self.product_b.uom_id.id,
                "price_unit": self.product_b.standard_price,
                "currency_id": self.env.company.currency_id.id,
            })],
        })
        # bill_2 is not posted, therefore its cost should be "to_billed" = - sum of all product_price * qty for each line
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'other_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_costs'],
                    'to_bill': 0.0,
                    'billed': -150.0,
                }, {
                    'id': 'other_purchase_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'],
                    'to_bill': -(self.product_a.standard_price + 2 * self.product_b.standard_price) * analytic_contribution,
                    'billed': -self.product_a.standard_price * analytic_contribution,
                }],
                'total': {
                    'to_bill': -(self.product_a.standard_price + 2 * self.product_b.standard_price) * analytic_contribution,
                    'billed': -self.product_a.standard_price * analytic_contribution - 150,
                },
            },
        )
        # post bill_2
        bill_2.action_post()
        # bill_2 is posted, therefore its cost should be counting in "billed", with the cost of bill_1
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'other_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_costs'],
                    'to_bill': 0.0,
                    'billed': -150.0,
                }, {
                    'id': 'other_purchase_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'],
                    'to_bill': 0.0,
                    'billed': -2 * (self.product_a.standard_price + self.product_b.standard_price) * analytic_contribution,
                }],
                'total': {
                    'to_bill': 0.0,
                    'billed': -2 * (self.product_a.standard_price + self.product_b.standard_price) * analytic_contribution - 150,
                },
            },
        )
        # create a new purchase order
        purchase_order = self.env['purchase.order'].create({
            "name": "A purchase order",
            "partner_id": self.partner_a.id,
            "order_line": [Command.create({
                "analytic_distribution": {self.analytic_account.id: analytic_distribution},
                "product_id": self.product_order.id,
                "product_qty": 1,
                "price_unit": self.product_order.standard_price,
                "currency_id": self.env.company.currency_id.id,
            })],
        })
        purchase_order.button_confirm()
        # we should have a new section "purchase_order", the total should be updated,
        # but the "other_purchase_costs" shouldn't change, as we don't take into
        # account bills from purchase orders, as those are already taken into calculations
        # from the purchase orders (in "purchase_order" section)
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'other_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_costs'],
                    'to_bill': 0.0,
                    'billed': -150.0,
                }, {
                    'id': 'purchase_order',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['purchase_order'],
                    'to_bill': -self.product_order.standard_price * analytic_contribution,
                    'billed': 0.0,
                }, {
                    'id': 'other_purchase_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'],
                    'to_bill': 0.0,
                    'billed': -2 * (self.product_a.standard_price + self.product_b.standard_price) * analytic_contribution,
                }],
                'total': {
                    'to_bill': -self.product_order.standard_price * analytic_contribution,
                    'billed': -2 * (self.product_a.standard_price + self.product_b.standard_price) * analytic_contribution - 150,
                },
            },
        )
        self._create_invoice_for_po(purchase_order)
        # now the bill has been posted, its costs should be accounted in the "billed" part
        # of the purchase_order section, but should touch in the other_purchase_costs
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'other_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_costs'],
                    'to_bill': 0.0,
                    'billed': -150.0,
                }, {
                    'id': 'purchase_order',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['purchase_order'],
                    'to_bill': -98.7,
                    'billed': -self.product_order.standard_price * analytic_contribution,
                }, {
                    'id': 'other_purchase_costs',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'],
                    'to_bill': 0.0,
                    'billed': -2 * (self.product_a.standard_price + self.product_b.standard_price) * analytic_contribution,
                }],
                'total': {
                    'to_bill': -98.7,
                    'billed': -(2 * self.product_a.standard_price +
                                2 * self.product_b.standard_price +
                                self.product_order.standard_price) * analytic_contribution - 150,
                },
            },
        )

    def test_account_analytic_distribution_ratio(self):
        """
        When adding multiple account analytics on a purchase line, and one of those
        is from a project (for ex: project created on confirmed SO),
        then in the profitability only the corresponding ratio of the analytic distribution
        for that project analytic account should be taken into account.
        (for ex: if there are 2 accounts on 1 line, one is 60% project analytic account, 40% some other,
        then the profitability should only reflect 60% of the cost of the line, not 100%)
        """
        # define the ratios for the analytic account of the line
        analytic_ratios = {
            "project_ratio": 60,
            "other_ratio": 40,
        }
        self.assertEqual(sum(ratio for ratio in analytic_ratios.values()), 100)
        # create another analytic_account that is not really relevant
        other_analytic_account = self.env['account.analytic.account'].create({
            'name': 'Not important',
            'code': 'KO-1234',
            'plan_id': self.analytic_plan.id,
        })
        # create a new purchase order
        purchase_order = self.env['purchase.order'].create({
            "name": "A purchase order",
            "partner_id": self.partner_a.id,
            "order_line": [Command.create({
                "analytic_distribution": {
                    # this is the analytic_account that is linked to the project
                    self.analytic_account.id: analytic_ratios["project_ratio"],
                    other_analytic_account.id: analytic_ratios["other_ratio"],
                },
                "product_id": self.product_order.id,
                "product_qty": 1,
                "price_unit": self.product_order.standard_price,
                "currency_id": self.env.company.currency_id.id,
            })],
        })
        purchase_order.button_confirm()
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'purchase_order',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['purchase_order'],
                    'to_bill': -(self.product_order.standard_price * (analytic_ratios["project_ratio"] / 100)),
                    'billed': 0.0,
                }],
                'total': {
                    'to_bill': -(self.product_order.standard_price * (analytic_ratios["project_ratio"] / 100)),
                    'billed': 0.0,
                },
            },
        )
        self._create_invoice_for_po(purchase_order)
        self.assertDictEqual(
            self.project._get_profitability_items(False)['costs'],
            {
                'data': [{
                    'id': 'purchase_order',
                    'sequence': self.project._get_profitability_sequence_per_invoice_type()['purchase_order'],
                    'to_bill': -141.0,
                    'billed': -(self.product_order.standard_price * (analytic_ratios["project_ratio"] / 100)),
                }],
                'total': {
                    'to_bill': -141.0,
                    'billed': -(self.product_order.standard_price * (analytic_ratios["project_ratio"] / 100)),
                },
            },
        )

    def test_multi_currency_for_project_purchase_profitability(self):
        """ This test ensures that when purchase orders with different currencies are linked to the same project, the amount are correctly computed according to the
        rate of the company """
        project = self.env['project.project'].create({'name': 'new project'})
        project._create_analytic_account()
        account = project.analytic_account_id
        foreign_company = self.company_data_2['company']
        foreign_company.currency_id = self.foreign_currency

        # a custom analytic contribution (number between 1 -> 100 included)
        analytic_distribution = 42
        analytic_contribution = analytic_distribution / 100.
        # Create a bill_1 with the foreign_currency.
        bill_1 = self.env['account.move'].create({
            "name": "Bill foreign currency",
            "move_type": "in_invoice",
            "state": "draft",
            "partner_id": self.partner.id,
            "invoice_date": datetime.today(),
            "date": datetime.today(),
            "invoice_date_due": datetime.today() - timedelta(days=1),
            "company_id": foreign_company.id,
            "invoice_line_ids": [Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_a.id,
                "quantity": 1,
                "product_uom_id": self.product_a.uom_id.id,
                "price_unit": self.product_a.standard_price,
                "currency_id": self.foreign_currency.id,
            }), Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_a.id,
                "quantity": 2,
                "product_uom_id": self.product_a.uom_id.id,
                "price_unit": self.product_a.standard_price,
                "currency_id": self.foreign_currency.id,
            })],
        })
        # Ensures that if no items have the main currency, the total is still displayed in the main currency.
        # Expected total : product_price * 0.2 (rate) * 3 (number of products).
        # Note : for some reason, the method to round the amount to the rounding of the currency is not 100% reliable.
        # We use a float_compare in order to ensure the value is close enough to the expected result. This problem has no repercusion on the client side, since
        # there is also a rounding method on this side to ensure the amount is correctly displayed.
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('other_purchase_costs', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][0]['sequence'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 0.6, items['data'][0]['to_bill'], 2), 0)
        self.assertEqual(0.0, items['data'][0]['billed'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 0.6, items['total']['to_bill'], 2), 0)
        self.assertEqual(0.0, items['total']['billed'])

        # Create a bill 2 with the main currency.
        bill_2 = self.env['account.move'].create({
            "name": "Bill main currency",
            "move_type": "in_invoice",
            "state": "draft",
            "partner_id": self.partner.id,
            "invoice_date": datetime.today(),
            "invoice_line_ids": [Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_a.id,
                "quantity": 1,
                "product_uom_id": self.product_a.uom_id.id,
                "price_unit": self.product_a.standard_price,
                "currency_id": self.env.company.currency_id.id,
            }), Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_a.id,
                "quantity": 2,
                "product_uom_id": self.product_a.uom_id.id,
                "price_unit": self.product_a.standard_price,
                "currency_id": self.env.company.currency_id.id,
            })],
        })

        # The 2 bills are in draft, therefore the "to_bill" section should contain the total cost of the 2 bills.
        # The expected total is therefore product_price * 1 * 3 + product_price * 0.2 * 3 => * 3.6
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('other_purchase_costs', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][0]['sequence'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['data'][0]['to_bill'], 2), 0)
        self.assertEqual(0.0, items['data'][0]['billed'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['total']['to_bill'], 2), 0)
        self.assertEqual(0.0, items['total']['billed'])

        # Bill 2 is posted. Its total is now in the 'billed' section, while the bill_1 is still in the 'to bill' one.
        bill_2.action_post()
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('other_purchase_costs', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][0]['sequence'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 0.6, items['data'][0]['to_bill'], 2), 0)
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3, items['data'][0]['billed'], 2), 0)
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 0.6, items['total']['to_bill'], 2), 0)
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3, items['total']['billed'], 2), 0)

        # Bill 1 is posted. Its total is now in the 'billed' section, the 'to bill' one should now be empty.
        bill_1.action_post()
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('other_purchase_costs', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][0]['sequence'])
        self.assertEqual(0.0, items['data'][0]['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['data'][0]['billed'], 2), 0)
        self.assertEqual(0.0, items['total']['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['total']['billed'], 2), 0)

        # create a new purchase order with the foreign company
        purchase_order_foreign = self.env['purchase.order'].create({
            "name": "A foreign purchase order",
            "partner_id": self.partner_a.id,
            "company_id": foreign_company.id,
            "order_line": [Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_order.id,
                "product_qty": 1,
                "price_unit": self.product_order.standard_price,
                "currency_id": self.foreign_currency.id,
            }), Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_order.id,
                "product_qty": 2,
                "price_unit": self.product_order.standard_price,
                "currency_id": self.foreign_currency.id,
            })],
        })
        purchase_order_foreign.button_confirm()

        # We should have a new section "purchase_order", the total should be updated,
        # but the "other_purchase_costs" shouldn't change, as we don't take into
        # account bills from purchase orders in this section.
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('purchase_order', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['purchase_order'], items['data'][0]['sequence'])
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 0.6, items['data'][0]['to_bill'], 2), 0)
        self.assertEqual(0.0, items['data'][0]['billed'])
        self.assertEqual('other_purchase_costs', items['data'][1]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][1]['sequence'])
        self.assertEqual(0.0, items['data'][1]['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['data'][1]['billed'], 2), 0)
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 0.6, items['total']['to_bill'], 2), 0)
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['total']['billed'], 2), 0)

        # create a new purchase order
        purchase_order = self.env['purchase.order'].create({
            "name": "A foreign purchase order",
            "partner_id": self.partner_a.id,
            "company_id": self.env.company.id,
            "order_line": [Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_order.id,
                "product_qty": 1,
                "price_unit": self.product_order.standard_price,
                "currency_id": self.env.company.currency_id.id,
            }), Command.create({
                "analytic_distribution": {account.id: analytic_distribution},
                "product_id": self.product_order.id,
                "product_qty": 2,
                "price_unit": self.product_order.standard_price,
                "currency_id": self.env.company.currency_id.id,
            })],
        })
        purchase_order.button_confirm()
        # The 'to bill' section should be updated in the 'total' and 'purchase orders' sections.
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('purchase_order', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['purchase_order'], items['data'][0]['sequence'])
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 3.6, items['data'][0]['to_bill'], 2), 0)
        self.assertEqual(0.0, items['data'][0]['billed'])
        self.assertEqual('other_purchase_costs', items['data'][1]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][1]['sequence'])
        self.assertEqual(0.0, items['data'][1]['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['data'][1]['billed'], 2), 0)
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 3.6, items['total']['to_bill'], 2), 0)
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['total']['billed'], 2), 0)

        self._create_invoice_for_po(purchase_order)
        # The purchase order of the main company has been billed. Its total should now be in the 'billed' section.
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('purchase_order', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['purchase_order'], items['data'][0]['sequence'])
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 0.6, items['data'][0]['to_bill'], 2), 0)
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 3, items['data'][0]['billed'], 2), 0)
        self.assertEqual('other_purchase_costs', items['data'][1]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][1]['sequence'])
        self.assertEqual(0.0, items['data'][1]['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['data'][1]['billed'], 2), 0)
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 0.6, items['total']['to_bill'], 2), 0)
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6 - self.product_order.standard_price * analytic_contribution * 3, items['total']['billed'], 2), 0)

        self._create_invoice_for_po(purchase_order_foreign)
        # The purchase order of the main company has been billed. Its total should now be in the 'billed' section.
        # The 'to bill' section of the purchase order should now be empty
        items = project._get_profitability_items(with_action=False)['costs']
        self.assertEqual('purchase_order', items['data'][0]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['purchase_order'], items['data'][0]['sequence'])
        self.assertEqual(0.0, items['data'][0]['to_bill'])
        self.assertEqual(float_compare(-self.product_order.standard_price * analytic_contribution * 3.6, items['data'][0]['billed'], 2), 0)
        self.assertEqual('other_purchase_costs', items['data'][1]['id'])
        self.assertEqual(project._get_profitability_sequence_per_invoice_type()['other_purchase_costs'], items['data'][1]['sequence'])
        self.assertEqual(0.0, items['data'][1]['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6, items['data'][1]['billed'], 2), 0)
        self.assertEqual(0.0, items['total']['to_bill'])
        self.assertEqual(float_compare(-self.product_a.standard_price * analytic_contribution * 3.6 - self.product_order.standard_price * analytic_contribution * 3.6, items['total']['billed'], 2), 0)

    def _create_invoice_for_po(self, purchase_order):
        purchase_order.action_create_invoice()
        purchase_bill = purchase_order.invoice_ids  # get the bill from the purchase
        purchase_bill.invoice_date = datetime.today()
        purchase_bill.action_post()
