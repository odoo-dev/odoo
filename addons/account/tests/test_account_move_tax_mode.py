from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo import Command
from odoo.tests import Form, tagged


@tagged('post_install', '-at_install')
class TestDocumentTaxModeCommon(AccountTestInvoicingCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.tax_10_default = cls.env['account.tax'].create({
            'name': '10% Tax (Default)',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 10,
            'company_id': cls.env.company.id,
        })
        cls.tax_10_override_include = cls.env['account.tax'].create({
            'name': '10% Tax (Override Included)',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 10,
            'company_id': cls.env.company.id,
            'price_include_override': 'tax_included',
            'include_base_amount': False,
        })
        cls.tax_10_override_exclude = cls.env['account.tax'].create({
            'name': '10% Tax (Override Excluded)',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 10,
            'company_id': cls.env.company.id,
            'price_include_override': 'tax_excluded',
            'include_base_amount': False,
        })
        cls.tax_20_default = cls.env['account.tax'].create({
            'name': '20% Tax (Default)',
            'type_tax_use': 'sale',
            'amount_type': 'percent',
            'amount': 20,
            'company_id': cls.env.company.id,
        })
        cls.test_product_a = cls.env['product.product'].create({
            'name': 'Test Product A',
            'list_price': 1000.0,
            'standard_price': 1000.0,
            'taxes_id': [Command.set([cls.tax_10_default.id])],
            'company_id': cls.env.company.id,
        })
        # Used for the cases with a company that has the tax mode set to tax included
        cls.company_tax_included = cls._create_company(
            name='Test Company (Tax Mode: Tax Included)',
            account_price_include='tax_included',
        )
        cls.test_product_b = cls.env['product.product'].with_company(cls.company_tax_included.id).create({
            'name': 'Test Product B',
            'list_price': 1000.0,
            'standard_price': 1000.0,
        })
        # Used for cases testing fiscal position
        cls.fpos_partner_id = cls.env['res.partner'].create({
            'name': "Fpos Partner",
            'vat': "BE0477472701",
            'country_id': cls.env.ref('base.be').id,
        })
        cls.fpos_id = cls.env['account.fiscal.position'].create({
            'name': "BE Fiscal Position",
            'country_id': cls.env.ref('base.be').id,
            'sequence': 1,
            'auto_apply': True,
        })

    def _get_document_specific_line(self, document, document_type):
        if document_type == 'invoice':
            document_specific_line = document.invoice_line_ids
        else:
            document_specific_line = document.order_line
        return document_specific_line

    def _adapt_values_for_document_type(self, document_type):
        if document_type == 'purchase_order':
            return 'supplier_taxes_id', 'standard_price'
        return 'taxes_id', 'list_price'

    def _test_tax_mode_change_with_product(self, document, document_type):
        # Set up correct document specific field names from account.move, sale.order or purchase.order
        line = self._get_document_specific_line(document, document_type)

        # Check initial document values
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # When a product is set on a line, switching between tax included and excluded
        # will only change the price_unit and not the document total amount values.
        document.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1100)
        self.assertRecordValues(document, document_expected_values)
        document.document_tax_mode = 'tax_excluded'
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_manual_price_unit_with_product(self, document, document_type):
        # Set up correct document specific field names from account.move, sale.order or purchase.order
        line = self._get_document_specific_line(document, document_type)

        # Check initial document values
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Changing the price_unit on the line will update the document total amount values
        line.price_unit = 2000
        new_document_expected_values_tax_excl = [{
            'amount_tax': 200,
            'amount_untaxed': 2000,
            'amount_total': 2200,
        }]
        self.assertRecordValues(document, new_document_expected_values_tax_excl)

        # Even when the price_unit is manually changed, switching between tax included and excluded
        # will only change the price_unit and not the document total amount values.
        new_document_expected_values_tax_incl = [{
            'amount_tax': 200,
            'amount_untaxed': 2000,
            'amount_total': 2200,
        }]
        document.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 2200)
        self.assertRecordValues(document, new_document_expected_values_tax_incl)

    def _test_tax_mode_change_uom_change_manual_price_unit_with_product(self, document, document_type):
        ''' Testing the document tax mode change when changing the unit of measure of a line,
        with and without the price unit being manually changed after adding a product'''

        # Set up correct document specific field names from account.move, sale.order or purchase.order
        line = self._get_document_specific_line(document, document_type)

        # Check initial document values
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Changing the unit of measure on the line will update the price_unit
        uom_dozen = self.env.ref('uom.product_uom_dozen')
        self.test_product_a.update({'uom_ids': uom_dozen})
        if document_type == 'purchase_order':
            line.uom_id = uom_dozen
        else:
            line.product_uom_id = uom_dozen
        self.assertEqual(line.price_unit, 12000)
        document_expected_values = [{
            'amount_tax': 1200,
            'amount_untaxed': 12000,
            'amount_total': 13200,
        }]
        self.assertRecordValues(document, document_expected_values)

        # Even after changing the unit of measure, the price_unit will be adapted accordingly when the tax mode is changed
        document.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 13200)
        self.assertRecordValues(document, document_expected_values)

        # Even if the price_unit is manually changed, the price_unit will be adapted accordingly when the unit of measurement is changed
        line.price_unit = 26400
        if document_type == 'purchase_order':
            line.uom_id = self.env.ref('uom.product_uom_unit')
        else:
            line.product_uom_id = self.env.ref('uom.product_uom_unit')
        document_expected_values = [{
            'amount_tax': 200,
            'amount_untaxed': 2000,
            'amount_total': 2200,
        }]
        self.assertEqual(line.price_unit, 2200)
        self.assertRecordValues(document, document_expected_values)

        # Changing the document tax mode will then recompute the price_unit accordingly
        document.document_tax_mode = 'tax_excluded'
        self.assertEqual(line.price_unit, 2000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_add_tax_manual_price_unit_with_product(self, document, document_type):
        ''' Testing the document tax mode change when adding and removing a tax on the line,
        with and without the price unit being manually changed after adding a product'''

        # Set up correct document specific field names from account.move, sale.order or purchase.order
        line = self._get_document_specific_line(document, document_type)

        # Check initial document values
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Changing the taxes on the line will update the document total amount values
        line.tax_ids |= self.tax_20_default
        document_expected_values_with_extra_tax = [{
            'amount_tax': 300,
            'amount_untaxed': 1000,
            'amount_total': 1300,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values_with_extra_tax)

        # When the taxes have been modified for a line with a product,
        # switching the tax mode should not affect the taxes
        document.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1300)
        self.assertEqual(line.tax_ids.ids, [self.tax_10_default.id, self.tax_20_default.id])
        self.assertRecordValues(document, document_expected_values_with_extra_tax)

        # Even if the price_unit is manually changed and a tax is removed,
        # switching the tax mode should not affect the taxes
        line.price_unit = 2600
        document_expected_values = [{
            'amount_tax': 600,
            'amount_untaxed': 2000,
            'amount_total': 2600,
        }]
        self.assertRecordValues(document, document_expected_values)
        line.tax_ids = self.tax_10_default
        document_expected_values_without_extra_tax = [{
            'amount_tax': 236.36,
            'amount_untaxed': 2363.64,
            'amount_total': 2600,
        }]
        self.assertEqual(line.price_unit, 2600)
        self.assertRecordValues(document, document_expected_values_without_extra_tax)

        # Changing the document tax mode will then recompute the price_unit accordingly
        document.document_tax_mode = 'tax_excluded'
        expected_price_unit = 2363.64 if document_type == 'purchase_order' else 2363.6363636363635
        self.assertEqual(line.price_unit, expected_price_unit)
        self.assertEqual(line.tax_ids.ids, [self.tax_10_default.id])
        self.assertRecordValues(document, document_expected_values_without_extra_tax)

    def _test_tax_mode_change_with_product_with_tax_override_taxes_company_tax_excluded(self, document, document_type):
        ''' Testing the document tax mode change when the company tax mode setting is 'Tax Excluded',
        for products with taxes that have tax included/excluded overrides.'''

        taxes_field_name, price_field_name = self._adapt_values_for_document_type(document_type)

        # Product with tax included overriden tax
        product_with_tax_included_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax included)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_include.id])],
            'company_id': self.env.company.id,
        })
        self.assertEqual(document.company_id.account_price_include, 'tax_excluded')
        line = self._get_document_specific_line(document, document_type)
        line.product_id = product_with_tax_included_override_tax

        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 90.91,
            'amount_untaxed': 909.09,
            'amount_total': 1000,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax excluded overriden tax
        product_with_tax_excluded_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax excluded)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_exclude.id])],
            'company_id': self.env.company.id,
        })
        document.document_tax_mode = 'tax_excluded'
        line.product_id = product_with_tax_excluded_override_tax

        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_with_product_with_tax_override_taxes_company_tax_included(self, document, document_type):
        ''' Testing the document tax mode change when the company tax mode setting is 'Tax Included',
        for products with taxes that have tax included/excluded overrides.'''

        taxes_field_name, price_field_name = self._adapt_values_for_document_type(document_type)

        # Product with tax excluded overriden tax
        self.tax_10_override_exclude.write({'company_id': self.company_tax_included})
        product_with_tax_excluded_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax excluded)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_exclude.id])],
            'company_id': self.company_tax_included.id,
        })
        self.assertEqual(document.company_id.account_price_include, 'tax_included')
        line = self._get_document_specific_line(document, document_type)

        line.product_id = product_with_tax_excluded_override_tax
        self.assertEqual(document.document_tax_mode, 'tax_included')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document.document_tax_mode = 'tax_excluded'
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax included overriden tax
        self.tax_10_override_include.write({'company_id': self.company_tax_included})
        product_with_tax_included_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax included)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_include.id])],
            'company_id': self.company_tax_included.id,
        })
        document.document_tax_mode = 'tax_included'
        line.product_id = product_with_tax_included_override_tax
        document_expected_values = [{
            'amount_tax': 90.91,
            'amount_untaxed': 909.09,
            'amount_total': 1000,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_with_product_with_mixed_taxes_company_tax_excluded(self, document, document_type):
        ''' Testing the document tax mode change when the company tax mode setting is 'Tax Excluded',
        for products with a combination of one tax included/excluded overriden tax + one default tax mode tax.'''

        taxes_field_name, price_field_name = self._adapt_values_for_document_type(document_type)
        # Product with tax included overriden tax + default tax
        product_with_tax_included_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax included)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_include.id, self.tax_10_default.id])],
            'company_id': self.env.company.id,
        })
        self.assertEqual(document.company_id.account_price_include, 'tax_excluded')
        line = self._get_document_specific_line(document, document_type)
        line.product_id = product_with_tax_included_override_tax

        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 181.82,
            'amount_untaxed': 909.09,
            'amount_total': 1090.91,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document.document_tax_mode = 'tax_included'
        # unlike the overidden tax, the default tax will impact the price_unit
        expected_price_unit = 1090.91 if document_type == 'purchase_order' else 1090.909090909091
        self.assertEqual(line.price_unit, expected_price_unit)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax excluded overriden tax + default tax
        product_with_tax_excluded_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax excluded)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_exclude.id, self.tax_10_default.id])],
            'company_id': self.env.company.id,
        })
        document.document_tax_mode = 'tax_excluded'
        line.product_id = product_with_tax_excluded_override_tax
        document_expected_values = [{
            'amount_tax': 200,
            'amount_untaxed': 1000,
            'amount_total': 1200,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_with_product_with_mixed_taxes_company_tax_included(self, document, document_type):
        ''' Testing the document tax mode change when the company tax mode setting is 'Tax Included',
        for products with a combination of one tax included/excluded overriden tax + one default tax mode tax.'''

        taxes_field_name, price_field_name = self._adapt_values_for_document_type(document_type)

        # Product with tax excluded overriden tax + default tax
        self.tax_10_override_exclude.write({'company_id': self.company_tax_included})
        # This tax needs to be reinstantiated as the company cannot be changed after a move has been created with it
        self.tax_10_default = self.env['account.tax'].create({
            'name': '10% Tax (Default)',
            'type_tax_use': 'sale' if document_type != 'purchase_order' else 'purchase',
            'amount_type': 'percent',
            'amount': 10,
            'company_id': self.company_tax_included.id,
            'include_base_amount': False,
        })
        product_with_tax_excluded_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax excluded)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_exclude.id, self.tax_10_default.id])],
            'company_id': self.company_tax_included.id,
        })
        self.assertEqual(document.company_id.account_price_include, 'tax_included')
        line = self._get_document_specific_line(document, document_type)
        line.product_id = product_with_tax_excluded_override_tax

        self.assertEqual(document.document_tax_mode, 'tax_included')
        document_expected_values = [{
            'amount_tax': 181.82,
            'amount_untaxed': 909.09,
            'amount_total': 1090.91,
        }]
        self.assertAlmostEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document.document_tax_mode = 'tax_excluded'
        # Unlike the overidden tax, the default tax will impact the price_unit
        expected_price_unit = 909.09 if document_type == 'purchase_order' else 909.0909090909092
        self.assertEqual(line.price_unit, expected_price_unit)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax included overriden tax + default tax
        self.tax_10_override_include.write({'company_id': self.company_tax_included})
        product_with_tax_included_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax included)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_include.id, self.tax_10_default.id])],
            'company_id': self.company_tax_included.id,
        })
        document.document_tax_mode = 'tax_included'
        line.product_id = product_with_tax_included_override_tax
        document_expected_values = [{
            'amount_tax': 166.66,
            'amount_untaxed': 833.34,
            'amount_total': 1000,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_with_fpos_manual_price_unit_with_product(self, document, document_type):
        ''' Testing the document tax mode change with a fiscal position affecting the tax,
        with and without the price unit being manually changed after adding a product'''
        # Set up correct document specific field names from account.move, sale.order or purchase.order
        line = self._get_document_specific_line(document, document_type)

        # Check initial document values
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        self.assertEqual(line.tax_ids, self.tax_10_default)
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Mapping the 20% default tax as the other fiscal position equivalent of the 10% default tax
        self.tax_20_default.update({
            'fiscal_position_ids': self.fpos_id,
            'original_tax_ids': self.tax_10_default,
        })
        # Changing the fiscal position by setting a customer with the equivalent fiscal position of the above tax
        if document_type == 'invoice':
            document.partner_id = self.fpos_partner_id
            # Clicking on 'Update Taxes and Accounts'
            document.action_update_fpos_values()
        else:  # for both purchase and sale orders there is an onchange for fpos that recomputes taxes
            form = Form(document)
            # Changing the fiscal position by setting a customer with the equivalent fiscal position of the above tax
            form.partner_id = self.fpos_partner_id
            form.save()

        # Check initial document values
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        self.assertEqual(line.tax_ids, self.tax_20_default)
        document_expected_values = [{
            'amount_tax': 200,
            'amount_untaxed': 1000,
            'amount_total': 1200,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Changing the tax mode should only change the price unit in this case
        document.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1200)
        self.assertRecordValues(document, document_expected_values)

        # Even if the price_unit is manually changed,
        # switching the tax mode will reset the values of the taxes to the ones on the product
        line.price_unit = 2400
        document_expected_values = [{
            'amount_tax': 400,
            'amount_untaxed': 2000,
            'amount_total': 2400,
        }]
        self.assertRecordValues(document, document_expected_values)

        # Changing the tax mode should only change the price unit in this case
        document.document_tax_mode = 'tax_excluded'
        self.assertEqual(line.price_unit, 2000)
        self.assertRecordValues(document, document_expected_values)


@tagged('post_install', '-at_install')
class TestAccountMoveTaxMode(TestDocumentTaxModeCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.invoice_one_line_with_product = cls._create_invoice_one_line(
            product_id=cls.test_product_a,
            company_id=cls.env.company.id,
        )
        cls.invoice_one_line_with_product_tax_incl_company = cls._create_invoice_one_line(
            product_id=cls.test_product_b,
            company_id=cls.company_tax_included,
        )
        cls.invoice_one_line_without_product = cls._create_invoice_one_line(
            price_unit=1000,
            tax_ids=cls.tax_10_default,
        )

    def test_account_move_tax_mode_change_with_product(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_with_product(invoice, 'invoice')

    def test_account_move_tax_mode_change_with_product_with_tax_override_taxes_company_tax_excluded(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_with_product_with_tax_override_taxes_company_tax_excluded(invoice, 'invoice')

    def test_account_move_tax_mode_change_with_product_with_tax_override_taxes_company_tax_included(self):
        invoice = self.invoice_one_line_with_product_tax_incl_company
        self._test_tax_mode_change_with_product_with_tax_override_taxes_company_tax_included(invoice, 'invoice')

    def test_account_move_tax_mode_change_with_product_with_mixed_taxes_company_tax_excluded(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_with_product_with_mixed_taxes_company_tax_excluded(invoice, 'invoice')

    def test_account_move_tax_mode_change_with_product_with_mixed_taxes_company_tax_included(self):
        invoice = self.invoice_one_line_with_product_tax_incl_company
        self._test_tax_mode_change_with_product_with_mixed_taxes_company_tax_included(invoice, 'invoice')

    def test_account_move_tax_mode_change_manual_price_unit_with_product(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_manual_price_unit_with_product(invoice, 'invoice')

    def test_account_move_test_tax_mode_change_uom_change_manual_price_unit_with_product(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_uom_change_manual_price_unit_with_product(invoice, 'invoice')

    def test_account_move_tax_mode_change_add_tax_manual_price_unit_with_product(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_add_tax_manual_price_unit_with_product(invoice, 'invoice')

    def test_account_move_tax_mode_change_with_fpos_manual_price_unit_with_product(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_with_fpos_manual_price_unit_with_product(invoice, 'invoice')

    def test_tax_mode_change_without_product(self):
        '''Testing tax mode change when no product is set on the line'''

        invoice = self.invoice_one_line_without_product
        self.assertEqual(invoice.document_tax_mode, 'tax_excluded')
        invoice_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        line = invoice.invoice_line_ids
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(invoice, invoice_expected_values)

        invoice.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1100)
        self.assertRecordValues(invoice, invoice_expected_values)

    def test_account_move_tax_mode_change_add_tax_without_product(self):
        '''Testing tax mode change after a tax has been added when no product is set on the line'''

        invoice = self.invoice_one_line_without_product
        self.assertEqual(invoice.document_tax_mode, 'tax_excluded')
        invoice_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        line = invoice.invoice_line_ids
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(invoice, invoice_expected_values)

        line.tax_ids |= self.tax_20_default
        self.assertEqual(line.price_unit, 1000)
        invoice_expected_values_with_extra_tax = [{
            'amount_tax': 300,
            'amount_untaxed': 1000,
            'amount_total': 1300,
        }]
        self.assertRecordValues(invoice, invoice_expected_values_with_extra_tax)

        invoice.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1300)
        self.assertRecordValues(invoice, invoice_expected_values_with_extra_tax)

    def test_account_move_tax_mode_change_with_imported_file(self):
        '''Testing tax mode change when invoice is populated with an imported file'''

        invoice = self.invoice_one_line_without_product
        self.assertEqual(invoice.document_tax_mode, 'tax_excluded')
        invoice_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        line = invoice.invoice_line_ids
        line.is_imported = True
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(invoice, invoice_expected_values)

        # When the tax mode changes the price unit should be recomputed,
        # unlike the cases of changing the product or uom of the line
        invoice.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1100)
        self.assertRecordValues(invoice, invoice_expected_values)
