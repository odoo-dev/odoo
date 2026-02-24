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
            'taxes_id': [Command.set([cls.tax_10_default.id])],
            'company_id': cls.env.company.id,
        })
        cls.company_tax_included = cls._create_company(
            name='Test Company (Tax Mode: Tax Included)',
            account_price_include='tax_included',
        )
        # Product used for the cases with a company that has the tax mode set to tax included
        cls.test_product_b = cls.env['product.product'].create({
            'name': 'Test Product B',
            'list_price': 1000.0,
            'company_id': cls.company_tax_included.id,
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
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        self.assertEqual(document_form.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # When a product is set on a line, switching between tax included and excluded
        # will only change the price_unit and not the document total amount values.
        document_form.document_tax_mode = 'tax_included'
        document_form.save()
        self.assertEqual(line.price_unit, 1100)
        self.assertRecordValues(document, document_expected_values)
        document_form.document_tax_mode = 'tax_excluded'
        document_form.save()
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_manual_price_unit_with_product(self, document, document_type):
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Changing the price_unit on the line will update the document total amount values
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.price_unit = 2000
        document_form.save()
        new_document_expected_values_tax_excl = [{
            'amount_tax': 200,
            'amount_untaxed': 2000,
            'amount_total': 2200,
        }]
        self.assertRecordValues(document, new_document_expected_values_tax_excl)

        # When the price_unit is manually changed it will remain the same when the tax mode is changed,
        # while the total amounts will be adapted accordingly.
        new_document_expected_values_tax_incl = [{
            'amount_tax': 181.82,
            'amount_untaxed': 1818.18,
            'amount_total': 2000,
        }]
        document_form.document_tax_mode = 'tax_included'
        document_form.save()
        self.assertEqual(line.price_unit, 2000)
        self.assertRecordValues(document, new_document_expected_values_tax_incl)

    def _test_tax_mode_change_uom_change_manual_price_unit_with_product(self, document, document_type):
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
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
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            if document_type == 'purchase_order':
                line_form.uom_id = uom_dozen
            else:
                line_form.product_uom_id = uom_dozen
        document_form.save()
        self.assertEqual(line.price_unit, 12000)
        new_document_expected_values = [{
            'amount_tax': 1200,
            'amount_untaxed': 12000,
            'amount_total': 13200,
        }]
        self.assertRecordValues(document, new_document_expected_values)

        # Even after changing the unit of measure, the price_unit will be adapted accordingly when the tax mode is changed
        document_form.document_tax_mode = 'tax_included'
        document_form.save()
        self.assertEqual(line.price_unit, 13200)
        self.assertRecordValues(document, new_document_expected_values)

        # If we change the price_unit on the line and then the uom the values will be reverted to the ones on the product
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.price_unit = 2000
            if document_type == 'purchase_order':
                line_form.uom_id = self.env.ref('uom.product_uom_unit')
            else:
                line_form.product_uom_id = self.env.ref('uom.product_uom_unit')
        document_form.save()
        self.assertEqual(line.price_unit, 1100)
        self.assertRecordValues(document, document_expected_values)

    def _test_tax_mode_change_add_tax_with_product(self, document, document_type):
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Changing the taxes on the line will update the document total amount values
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.tax_ids.add(self.tax_20_default)
        document_form.save()
        new_document_expected_values = [{
            'amount_tax': 300,
            'amount_untaxed': 1000,
            'amount_total': 1300,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, new_document_expected_values)

        # When the taxes have been modified for a line with a product,
        # switching the tax mode will reset the values of price_unit and taxes to the ones on the product.
        document_form.document_tax_mode = 'tax_included'
        document_form.save()
        self.assertEqual(line.price_unit, 1100)
        self.assertEqual(line.tax_ids.ids, [self.tax_10_default.id])
        self.assertRecordValues(document, document_expected_values)

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
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_included_override_tax
        document_form.save()

        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 90.91,
            'amount_untaxed': 909.09,
            'amount_total': 1000,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document_form.document_tax_mode = 'tax_included'
        document_form.save()
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax excluded overriden tax
        product_with_tax_excluded_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax excluded)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_exclude.id])],
            'company_id': self.env.company.id,
        })
        document_form.document_tax_mode = 'tax_excluded'
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_excluded_override_tax
        document_form.save()
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
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_excluded_override_tax
        document_form.save()

        self.assertEqual(document.document_tax_mode, 'tax_included')
        document_expected_values = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document_form.document_tax_mode = 'tax_excluded'
        document_form.save()
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
        document_form.document_tax_mode = 'tax_included'
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_included_override_tax
        document_form.save()
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
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_included_override_tax
        document_form.save()

        self.assertEqual(document.document_tax_mode, 'tax_excluded')
        document_expected_values = [{
            'amount_tax': 181.82,
            'amount_untaxed': 909.09,
            'amount_total': 1090.91,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document_form.document_tax_mode = 'tax_included'
        document_form.save()
        # unlike the overidden tax, the default tax will impact the price_unit
        self.assertEqual(line.price_unit, 1090.909090909091)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax excluded overriden tax + default tax
        product_with_tax_excluded_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax excluded)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_exclude.id, self.tax_10_default.id])],
            'company_id': self.env.company.id,
        })
        document_form.document_tax_mode = 'tax_excluded'
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_excluded_override_tax
        document_form.save()
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
        document_form = Form(document)
        line = self._get_document_specific_line(document, document_type)
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_excluded_override_tax
        document_form.save()

        self.assertEqual(document.document_tax_mode, 'tax_included')
        document_expected_values = [{
            'amount_tax': 181.82,
            'amount_untaxed': 909.09,
            'amount_total': 1090.91,
        }]
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(document, document_expected_values)

        document_form.document_tax_mode = 'tax_excluded'
        document_form.save()
        # unlike the overidden tax, the default tax will impact the price_unit
        self.assertEqual(line.price_unit, 909.0909090909091)
        self.assertRecordValues(document, document_expected_values)

        # Product with tax included overriden tax + default tax
        self.tax_10_override_include.write({'company_id': self.company_tax_included})
        product_with_tax_included_override_tax = self.env['product.product'].create({
            'name': 'Product (with override tax included)',
            price_field_name: 1000.0,
            taxes_field_name: [Command.set([self.tax_10_override_include.id, self.tax_10_default.id])],
            'company_id': self.company_tax_included.id,
        })
        document_form.document_tax_mode = 'tax_included'
        with self._get_document_specific_line(document_form, document_type).edit(0) as line_form:
            line_form.product_id = product_with_tax_included_override_tax
        document_form.save()
        document_expected_values = [{
            'amount_tax': 166.66,
            'amount_untaxed': 833.34,
            'amount_total': 1000,
        }]
        self.assertEqual(line.price_unit, 1000)
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

    def test_account_move_tax_mode_change_add_tax_with_product(self):
        invoice = self.invoice_one_line_with_product
        self._test_tax_mode_change_add_tax_with_product(invoice, 'invoice')

    def test_account_move_tax_mode_change_add_tax_without_product(self):
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
        new_invoice_expected_values_tax_excl = [{
            'amount_tax': 300,
            'amount_untaxed': 1000,
            'amount_total': 1300,
        }]
        self.assertRecordValues(invoice, new_invoice_expected_values_tax_excl)

        new_invoice_expected_values_tax_incl = [{
            'amount_tax': 230.77,
            'amount_untaxed': 769.23,
            'amount_total': 1000,
        }]
        invoice.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(invoice, new_invoice_expected_values_tax_incl)

    def test_tax_mode_change_without_product(self):
        invoice = self.invoice_one_line_without_product
        self.assertEqual(invoice.document_tax_mode, 'tax_excluded')
        invoice_expected_values_before_tax_mode_change = [{
            'amount_tax': 100,
            'amount_untaxed': 1000,
            'amount_total': 1100,
        }]
        line = invoice.invoice_line_ids
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(invoice, invoice_expected_values_before_tax_mode_change)

        invoice_expected_values_after_tax_mode_change = [{
            'amount_tax': 90.91,
            'amount_untaxed': 909.09,
            'amount_total': 1000,
        }]
        invoice.document_tax_mode = 'tax_included'
        self.assertEqual(line.price_unit, 1000)
        self.assertRecordValues(invoice, invoice_expected_values_after_tax_mode_change)
