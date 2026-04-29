from odoo.tests import tagged

from odoo.addons.account_edi_ubl_cii.tests.test_ubl_export_bis3_be import TestUblExportBis3BE


@tagged('post_install_l10n', 'post_install', '-at_install', *TestUblExportBis3BE.extra_tags)
class TestUblExportBis3InvoiceBETaxesRules(TestUblExportBis3BE):

    def test_invoice_BR_CO_10_line_extension_amount_sum_lines(self):
        """ [BR_CO_10] Sum of Invoice line net amount (BT-106) = Σ Invoice line net amount (BT-131). """
        tax_21 = self.percent_tax(21.0)
        product = self._create_product(lst_price=0.4567, taxes_id=tax_21)
        invoice = self._create_invoice(
            partner_id=self.partner_be,
            invoice_line_ids=[
                self._prepare_invoice_line(product_id=product),
                self._prepare_invoice_line(product_id=product),
                self._prepare_invoice_line(product_id=product),
                self._prepare_invoice_line(product_id=product),
                self._prepare_invoice_line(product_id=product),
                self._prepare_invoice_line(product_id=product),
                self._prepare_invoice_line(product_id=product, price_unit=1000.45),
            ],
            post=True,
        )

        self._generate_invoice_ubl_file(invoice)
        self._assert_invoice_ubl_file(invoice, 'test_invoice_BR_CO_10_line_extension_amount_sum_lines')

    def test_invoice_BR_CO_17_tax_amount_equals_taxable_amount_mul_percent(self):
        """ [BR-CO-17]-VAT category tax amount (BT-117) = VAT category taxable amount (BT-116) x (VAT category rate (BT-119) / 100), rounded to two decimals."""
        tax_6 = self.percent_tax(6.0)
        product = self._create_product(lst_price=100.025, taxes_id=tax_6)
        invoice = self._create_invoice(
            partner_id=self.partner_be,
            invoice_line_ids=[
                self._prepare_invoice_line(product_id=product)
                for _i in range(50)
            ],
            post=True,
        )

        self._generate_invoice_ubl_file(invoice)
        self._assert_invoice_ubl_file(invoice, 'test_invoice_BR_CO_17_tax_amount_equals_taxable_amount_mul_percent')

    def test_invoice_PEPPOL_EN16931_R120_line_extension_amount_huge_number_of_decimals(self):
        """ [PEPPOL-EN16931-R120]-Invoice line net amount MUST equal (Invoiced quantity * (Item net price/item price base quantity)
        + Sum of invoice line charge amount - sum of invoice line allowance amount
        """
        tax_21 = self.percent_tax(21.0)
        product = self._create_product(lst_price=0.01110515963896, taxes_id=tax_21)
        invoice = self._create_invoice_one_line(
            product_id=product,
            quantity=278362.5,
            partner_id=self.partner_be,
            post=True,
        )

        self._generate_invoice_ubl_file(invoice)
        self._assert_invoice_ubl_file(invoice, 'test_invoice_PEPPOL_EN16931_R120_line_extension_amount_huge_number_of_decimals')

    def test_invoice_BR_S_08_tax_subtotal_taxable_amount(self):
        """ [BR-S-08] For each different value of VAT category rate (BT-119) where the VAT category code (BT-118) is "Standard rated",
        the VAT category taxable amount (BT-116) in a VAT breakdown (BG-23) shall equal the sum of Invoice line net amounts (BT-131)
        plus the sum of document level charge amounts (BT-99) minus the sum of document level allowance amounts (BT-92)
        where the VAT category code (BT-151, BT-102, BT-95) is "Standard rated" and the VAT rate (BT-152, BT-103, BT-96)
        equals the VAT category rate (BT-119)
        """
        tax_recupel = self.fixed_tax(1.254, name="RECUPEL", include_base_amount=True)
        tax_auvibel = self.fixed_tax(1.254, name="AUVIBEL", include_base_amount=True)
        tax_21 = self.percent_tax(21.0)
        invoice = self._create_invoice(
            partner_id=self.partner_be,
            invoice_line_ids=[
                self._prepare_invoice_line(
                    product_id=self.product_a,
                    price_unit=100.0,
                    tax_ids=tax_recupel + tax_21,
                ),
                self._prepare_invoice_line(
                    product_id=self.product_a,
                    price_unit=100.0,
                    tax_ids=tax_auvibel + tax_21,
                ),
            ],
            post=True,
        )

        self._generate_invoice_ubl_file(invoice)
        self._assert_invoice_ubl_file(invoice, 'test_invoice_BR_S_08_tax_subtotal_taxable_amount')

    def test_invoice_BR_E_08_tax_subtotal_taxable_amount_1(self):
        """ [BR-E-08] In a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Exempt from VAT"
            the VAT category taxable amount (BT-116) shall equal the sum of Invoice line net amounts (BT-131)
            minus the sum of Document level allowance amounts (BT-92) plus the sum of Document level charge
            amounts (BT-99) where the VAT category codes (BT-151, BT-95, BT-102) are "Exempt from VAT".
        """
        tax_0 = self.percent_tax(0.0)
        tax_6 = self.percent_tax(6.0)
        product_1 = self._create_product(lst_price=90.30, taxes_id=tax_0)
        product_2 = self._create_product(lst_price=2.54, taxes_id=tax_6)
        product_3 = self._create_product(lst_price=6.87, taxes_id=tax_6)
        invoice = self._create_invoice(
            partner_id=self.partner_be,
            invoice_line_ids=[
                self._prepare_invoice_line(product_id=product_1),
                self._prepare_invoice_line(product_id=product_2, quantity=0.45),
                self._prepare_invoice_line(product_id=product_3, quantity=0.28),
            ],
            post=True,
        )

        self._generate_invoice_ubl_file(invoice)
        self._assert_invoice_ubl_file(invoice, 'test_invoice_BR_E_08_tax_subtotal_taxable_amount_1')

    def test_invoice_BR_E_08_tax_subtotal_taxable_amount_2(self):
        """ [BR-E-08] In a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Exempt from VAT"
            the VAT category taxable amount (BT-116) shall equal the sum of Invoice line net amounts (BT-131)
            minus the sum of Document level allowance amounts (BT-92) plus the sum of Document level charge
            amounts (BT-99) where the VAT category codes (BT-151, BT-95, BT-102) are "Exempt from VAT".
        """
        tax_0 = self.percent_tax(0.0)
        invoice = self._create_invoice(
            partner_id=self.partner_be,
            invoice_line_ids=[
                self._prepare_invoice_line(product_id=self.product_a, price_unit=39.615, quantity=4.0, discount=20.0, tax_ids=tax_0),
                self._prepare_invoice_line(product_id=self.product_a, price_unit=0.84, quantity=4.0, discount=20.0, tax_ids=tax_0),
            ],
            post=True,
        )
        self._generate_invoice_ubl_file(invoice)
        self._assert_invoice_ubl_file(invoice, 'test_invoice_BR_E_08_tax_subtotal_taxable_amount_2')
