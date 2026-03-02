# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged, Form
from odoo.addons.mrp.tests.common import TestBomCostCommon, TestBomCostOperationCommon
from odoo.addons.stock_account.tests.common import TestStockValuationCommon


@tagged('-at_install', 'post_install')
class TestBomPriceCommon(TestStockValuationCommon, TestBomCostCommon):

    @classmethod
    def _create_mo(cls, bom, quantity, confirm=True):
        mo = cls.env['mrp.production'].create({
            'product_id': bom.product_id.id,
            'bom_id': bom.id,
            'product_qty': quantity,
            'company_id': bom.company_id.id,
        })
        if confirm:
            mo.action_confirm()
        return mo

    @classmethod
    def _produce(cls, mo, quantity=0):
        mo_form = Form(mo)
        if not quantity:
            quantity = mo.product_qty - mo.qty_produced
        mo_form.qty_producing += quantity
        return mo_form.save()

    @classmethod
    def _use_production_accounting(cls):
        cls.account_production = cls.env['account.account'].create({
            'name': 'Production Account',
            'code': '100102',
            'account_type': 'asset_current',
        })
        production_locations = cls.env['stock.location'].search([('usage', '=', 'production'), ('company_id', '=', cls.company.id)])
        production_locations.valuation_account_id = cls.account_production.id
        return cls.account_production

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.prod_location = cls.warehouse._get_production_location()
        cls.dining_table.categ_id = cls.category_fifo_auto
        cls.glass.categ_id = cls.category_avco_auto
        cls._use_production_accounting()


class TestBomPriceOperationCommon(TestBomCostOperationCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.user.write({'group_ids': [(4, cls.env.ref('mrp.group_mrp_routings').id)]})
        cls.account_expense_wo = cls.env['account.account'].create({
            'code': 'X2120',
            'name': 'WO - Expenses',
            'account_type': 'expense',
        })
        cls.workcenter.expense_account_id = cls.account_expense.id