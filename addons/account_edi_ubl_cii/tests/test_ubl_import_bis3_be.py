from odoo import Command
from odoo.addons.account_edi_ubl_cii.tests.common import TestUblBis3BECommon
from odoo.tests import tagged
from odoo.tools import misc

from freezegun import freeze_time


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestUblImportBis3BE(TestUblBis3BECommon):

    @freeze_time('2020-01-01')
    def test_import_partner(self):
        self.partner_be.unlink()
        self.assertFalse(self.env['res.partner'].search([('vat', '=', 'BE0477472701')]))

        # Test the partner has been created.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_partner.xml',
            journal=self.company_data['default_journal_sale'],
        )
        partner = invoice.partner_id
        self.assertRecordValues(partner, [{
            'name': "My Belgian Partner",
            'street': "Rue des Trucs 9",
            'city': "Bidule",
            'zip': "6713",
            'vat': 'BE0477472701',
            'peppol_eas': '0208',
            'peppol_endpoint': '0477472701',
        }])

        # Test the partner has been retrieved.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_partner.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(invoice.partner_id, [{'id': partner.id}])

    @freeze_time('2020-01-01')
    def test_import_discount_per_line_price_on_big_quantity(self):
        tax_21 = self.percent_tax(21.0)

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_discount_per_line_price_on_big_quantity.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                {
                    'quantity': 150.0,
                    'price_unit': 0.53,
                    'discount': 12.0,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 200.0,
                    'price_unit': 0.64,
                    'discount': 12.0,
                    'tax_ids': tax_21.ids,
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 182.15,
                    'amount_tax': 38.25,
                    'amount_total': 220.40,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_import_lot_of_decimals_in_quantities(self):
        tax_21 = self.percent_tax(21.0)

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_lot_of_decimals_in_quantities.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                {
                    'quantity': 0.93,
                    'price_unit': 101.35,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 0.28,
                    'price_unit': 101.36,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 0.5,
                    'price_unit': 126.7,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 1.0,
                    'price_unit': 6.45,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 1.0,
                    'price_unit': 14.44,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 1.0,
                    'price_unit': 25.79,
                    'tax_ids': tax_21.ids,
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 233.34,
                    'amount_tax': 49.0,
                    'amount_total': 282.34,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_import_not_matched_tax(self):
        """ The tax has not been retrieved. Do not store any 'extra_tax_data'. """
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_discount_per_line_price_on_big_quantity.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                {
                    'quantity': 150.0,
                    'price_unit': 0.53,
                    'discount': 12.0,
                    'tax_ids': [],
                    'extra_tax_data': False,
                },
                {
                    'quantity': 200.0,
                    'price_unit': 0.64,
                    'discount': 12.0,
                    'tax_ids': [],
                    'extra_tax_data': False,
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 182.6,
                    'amount_tax': 0.0,
                    'amount_total': 182.6,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_import_mixed_allowance_charges(self):
        tax_25 = self.percent_tax(25.0)
        tax_0 = self.env['account.chart.template'].ref('sale_export_tax_template')

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_mixed_allowance_charges.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                # Invoice line 1
                {
                    'quantity': 10.0,
                    'price_unit': 450.0,
                    'discount': 11.133333333333338,
                    'tax_ids': tax_25.ids,
                },
                # Invoice line 1, charge.
                {
                    'quantity': 1.0,
                    'price_unit': 1.0,
                    'discount': 0.0,
                    'tax_ids': tax_25.ids,
                },
                # Invoice line 2
                {
                    'quantity': 10.0,
                    'price_unit': 100.0,
                    'discount': 0.0,
                    'tax_ids': tax_0.ids,
                },
                # Invoice line 3
                {
                    'quantity': 10.0,
                    'price_unit': 100.0,
                    'discount': 10.100000000000007,
                    'tax_ids': tax_25.ids,
                },
                # Invoice line 3, charge
                {
                    'quantity': 1.0,
                    'price_unit': 1.0,
                    'discount': 0.0,
                    'tax_ids': tax_25.ids,
                },
                # Invoice global charge
                {
                    'quantity': 0.2,
                    'price_unit': 1000.0,
                    'discount': 0.0,
                    'tax_ids': tax_25.ids,
                },
                # Invoice global allowance
                {
                    'quantity': 1.0,
                    'price_unit': -200.0,
                    'discount': 0.0,
                    'tax_ids': tax_25.ids,
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 5900.0,
                    'amount_tax': 1225.0,
                    'amount_total': 7125.0,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_import_predictive_invoice_matched_tax_and_account(self):
        tax_21_1 = self.percent_tax(21.0, sequence=1)
        tax_21_2 = self.percent_tax(21.0, sequence=2)
        default_account = self.company_data['default_account_revenue']
        new_account = default_account.copy()

        # Retrieve the tax having the lower sequence.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_discount_per_line_price_on_big_quantity.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [{
                'tax_ids': tax_21_1.ids,
                'account_id': default_account.id,
            }] * 2,
        )

        # Same with an existing invoice using the other.
        self._create_invoice(
            partner_id=invoice.partner_id,
            invoice_line_ids=[
                self._prepare_invoice_line(
                    name='Cheville légères HLD 2',
                    price_unit=1234.56,
                    tax_ids=tax_21_2,
                    account_id=new_account,
                )
            ],
            post=True,
        )

        # Retrieve the tax having the lower sequence.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_discount_per_line_price_on_big_quantity.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [{
                'tax_ids': tax_21_2.ids,
                'account_id': new_account.id,
            }] * 2,
        )

    @freeze_time('2020-01-01')
    def test_import_predictive_invoice_matched_multiple_taxes_same_rate(self):
        """ In the xml, we retrieve a total for a 21.0% tax rate. However, the prediction
        finds a different 21% tax for each line.
        """
        tax_21_1 = self.percent_tax(21.0)
        tax_21_2 = self.percent_tax(21.0)

        self._create_invoice(
            partner_id=self.partner_be.id,
            invoice_line_ids=[
                self._prepare_invoice_line(
                    name='Cheville légères HLD 2',
                    price_unit=1234.56,
                    tax_ids=tax_21_1,
                ),
                self._prepare_invoice_line(
                    name='Vis pour cheville HLD 3',
                    price_unit=1234.56,
                    tax_ids=tax_21_2,
                ),
            ],
            post=True,
        )

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_discount_per_line_price_on_big_quantity.xml',
            journal=self.company_data['default_journal_sale'],
        )
        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                {
                    'quantity': 150.0,
                    'price_unit': 0.53,
                    'discount': 12.0,
                    'tax_ids': tax_21_1.ids,
                },
                {
                    'quantity': 200.0,
                    'price_unit': 0.64,
                    'discount': 12.0,
                    'tax_ids': tax_21_2.ids,
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 182.15,
                    'amount_tax': 38.25,
                    'amount_total': 220.40,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_import_cash_rounding_add_invoice_line(self):
        tax_21 = self.percent_tax(21.0)

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_cash_rounding_add_invoice_line.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                {
                    'quantity': 1.0,
                    'price_unit': 899.99,
                    'tax_ids': tax_21.ids,
                },
                {
                    'quantity': 1.0,
                    'price_unit': 0.01,
                    'tax_ids': [],
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 900.0,
                    'amount_tax': 189.0,
                    'amount_total': 1089.0,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_import_cash_rounding_biggest_tax(self):
        tax_21 = self.percent_tax(21.0)

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_import_cash_rounding_biggest_tax.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(
            invoice.invoice_line_ids,
            [
                {
                    'quantity': 1.0,
                    'price_unit': 899.99,
                    'tax_ids': tax_21.ids,
                },
            ],
        )
        self.assertRecordValues(
            invoice,
            [
                {
                    'amount_untaxed': 899.99,
                    'amount_tax': 189.01,
                    'amount_total': 1089.0,
                },
            ],
        )

    @freeze_time('2020-01-01')
    def test_partial_import_invoice_line_name(self):
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_name_1.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {'name': 'description'},
        ])

        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_name_2.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {'name': 'name'},
        ])

    @freeze_time('2020-01-01')
    def test_partial_import_invoice_line_price_unit_quantity(self):
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_price_unit_quantity_1.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {
                'price_unit': 899.99,
                'quantity': 1.0,
            },
        ])

        # Combined with a quantity.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_price_unit_quantity_2.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {
                'price_unit': 179.998,
                'quantity': 5.0,
            },
        ])

        # Combined with both allowance and charge.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_price_unit_quantity_3.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {
                'price_unit': 200.0,
                'quantity': 5.0,
                'discount': 10.000000000000007,
            },
            {
                'price_unit': 50.0,
                'quantity': 1.0,
                'discount': 0.0,
            },
        ])

        # Compute from PriceAmount and BaseQuantity.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_price_unit_quantity_4.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {
                'price_unit': 90.0,
                'quantity': 5.0,
            },
        ])

        # Combine with allowance/charge on price.
        invoice = self._import_as_attachment_on(
            file_path='bis3/import/test_partial_import_invoice_line_price_unit_quantity_5.xml',
            journal=self.company_data['default_journal_sale'],
        )

        self.assertRecordValues(invoice.invoice_line_ids, [
            {
                'price_unit': 90.0,
                'quantity': 5.0,
            },
        ])
