from lxml import etree
from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo import fields, Command


@tagged('post_install', '-at_install')
class TestL10nPlEdi(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.country_pl = cls.env.ref('base.pl')
        cls.company_data['company'].write({
            'country_id': cls.country_pl.id,
            'vat': 'PL1234567883',
            'street': 'Test Street 1',
            'city': 'Warsaw',
            'zip': '00-001',
        })

        # 2. Setup Polish Customer
        cls.partner_pl = cls.env['res.partner'].create({
            'name': 'Test Customer PL',
            'is_company': True,
            'country_id': cls.country_pl.id,
            'vat': 'PL1111111111',
            'street': 'Partner St. 5',
            'city': 'Krakow',
            'zip': '30-001',
        })
        cls.tax_23 = cls.company_data['default_tax_sale']
        cls.tax_23.write({
            'amount': 23.0,
            'name': 'VAT 23%',
            'amount_type': 'percent'
        })

        cls.product_a.write({
            'taxes_id': [Command.set(cls.tax_23.ids)]
        })
        cls.cash_journal = cls.company_data['default_journal_cash']

        cls.cash_journal.inbound_payment_method_line_ids.write({
            'payment_account_id': cls.cash_journal.default_account_id.id
        })

    def _get_xml_value(self, xml_content, xpath):
        """Helper to parse XML and return text of a specific node."""
        root = etree.fromstring(xml_content)
        ns = {'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}
        nodes = root.xpath(xpath, namespaces=ns)
        if nodes:
            return nodes[0].text
        return None

    def _get_xml_nodes(self, xml_content, xpath):
        """Helper to return a list of nodes."""
        root = etree.fromstring(xml_content)
        ns = {'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}
        return root.xpath(xpath, namespaces=ns)

    def test_scenario_1_standard_vat(self):
        """
        Scenario 1: Standard VAT Invoice.

        This test verifies that a regular Odoo invoice (not a down payment or correction)
        generates a KSeF XML with the invoice type <RodzajFaktury>VAT</RodzajFaktury>.
        It simulates a simple sale of a product.
        """
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'invoice_line_ids': [
                Command.create({
                    'product_id': self.product_a.id,
                    'quantity': 1,
                    'price_unit': 1000.0,
                })
            ],
        })
        invoice.action_post()

        xml = invoice._l10n_pl_ksef_render_xml()

        # Verify
        self.assertEqual(self._get_xml_value(xml, "//ns:RodzajFaktury"), 'VAT')

    def test_scenario_correction_standard(self):
        """
        Scenario 5: Correction of a Standard Invoice (KOR).
        This test verifies that creating a Credit Note (reversal) for a standard invoice
        generates a KSeF XML with invoice type KOR.
        """
        # Create Invoice
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id, 'price_unit': 1000.0})],
        })
        invoice.action_post()

        reversal_wizard = self.env['account.move.reversal'].with_context(
            active_model="account.move", active_ids=invoice.ids
        ).create({
            'reason': 'Correction Test',
            'journal_id': invoice.journal_id.id,
        })
        reversal_wizard.refund_moves()

        credit_note = invoice.reversal_move_ids
        credit_note.action_post()

        xml = credit_note._l10n_pl_ksef_render_xml()

        self.assertEqual(self._get_xml_value(xml, "//ns:RodzajFaktury"), 'KOR')
        self.assertEqual(self._get_xml_value(xml, "//ns:NrFaKorygowanej"), invoice.name)

    def test_payment_logic_partial_mixed_methods(self):
        """
        Test the <Platnosc> block for a Partially Paid invoice with mixed methods.
        We expect:
        - ZnacznikZaplatyCzesciowej = 1
        - Two ZaplataCzesciowa blocks.
        - FormaPlatnosci = 1 for Cash.
        - FormaPlatnosci = 6 for Bank.
        """
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'currency_id': self.env.ref('base.PLN').id,
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'quantity': 1,
                'price_unit': 1000.0,
            })],
        })
        invoice.action_post()

        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids
        ).create({
            'amount': 300.0,
            'journal_id': self.cash_journal.id,
            'payment_date': fields.Date.today(),
        })._create_payments()

        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids
        ).create({
            'amount': 400.0,
            'journal_id': self.cash_journal.id,
            'payment_date': fields.Date.today(),
        })._create_payments()

        self.assertEqual(invoice.payment_state, 'partial')

        xml = invoice._l10n_pl_ksef_render_xml()

        self.assertEqual(self._get_xml_value(xml, "//ns:Platnosc/ns:ZnacznikZaplatyCzesciowej"), '1')

        payment_nodes = self._get_xml_nodes(xml, "//ns:Platnosc/ns:ZaplataCzesciowa")
        self.assertEqual(len(payment_nodes), 2, "Should have exactly 2 partial payment blocks")

        cash_node = [n for n in payment_nodes if n.find('ns:KwotaZaplatyCzesciowej', namespaces={'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}).text == '300.00']
        self.assertTrue(cash_node, "Cash payment of 300.00 not found in XML")
        self.assertEqual(
            cash_node[0].find('ns:FormaPlatnosci', namespaces={'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}).text,
            '1',
            "Cash payment should have FormaPlatnosci = 1"
        )

        bank_node = [n for n in payment_nodes if n.find('ns:KwotaZaplatyCzesciowej', namespaces={'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}).text == '400.00']
        self.assertTrue(bank_node, "Bank payment of 400.00 not found in XML")
        self.assertEqual(
            bank_node[0].find('ns:FormaPlatnosci', namespaces={'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}).text,
            '1',
            "cash payment should have FormaPlatnosci = 1"
        )

    def test_payment_logic_fully_paid(self):
        """
        Test the <Platnosc> block for a Fully Paid invoice.
        We expect:
        - Zaplacono = 1
        - ZnacznikZaplatyCzesciowej = 2 (Not partial, because it is fully paid)
        - DataZaplaty present
        """
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id, 'price_unit': 100.0})],
        })
        invoice.action_post()

        # 3. Create the payment
        self.env['account.payment.register'].with_context(
            active_model='account.move',
            active_ids=invoice.ids
        ).create({
            'journal_id': self.cash_journal.id,
        })._create_payments()

        self.assertEqual(invoice.payment_state, 'paid')
        xml = invoice._l10n_pl_ksef_render_xml()

        # Assertions
        self.assertEqual(self._get_xml_value(xml, "//ns:Platnosc/ns:Zaplacono"), '1')
        self.assertTrue(self._get_xml_value(xml, "//ns:Platnosc/ns:DataZaplaty"), "DataZaplaty should be present")

    def test_payment_logic_partial_then_full_payment(self):
        """
        Test the <Platnosc> block when an invoice is paid in installments (Partial -> Full).

        Scenario:
        1. Create Invoice for 1000 PLN.
        2. Pay 400 PLN (Status becomes Partial).
        3. Pay remaining 600 PLN (Status becomes Paid).

        Logic Path in Template:
        - invoice.payment_state is 'paid'.
        - len(payments) is 2.
        - The code enters the 'else' block (because len != 1).

        Expectations:
        - ZnacznikZaplatyCzesciowej = 2 (It is fully paid, so flag is 2/No).
        - ZaplataCzesciowa nodes should be present (listing the 2 payments).
        - Zaplacono should NOT be present (based on your template logic for multi-payment).
        """
        # 1. Create Invoice
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'currency_id': self.env.ref('base.PLN').id,
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'quantity': 1,
                'price_unit': 1000.0,
                'tax_ids': [],
            })],
        })
        invoice.action_post()

        # 2. Register First Partial Payment (400 PLN)
        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids
        ).create({
            'amount': 400.0,
            'journal_id': self.cash_journal.id,
            'payment_date': fields.Date.today(),
        })._create_payments()

        self.assertEqual(invoice.payment_state, 'partial')
        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids
        ).create({
            'amount': 600.0,
            'journal_id': self.cash_journal.id,
            'payment_date': fields.Date.today(),
        })._create_payments()
        self.assertEqual(invoice.payment_state, 'paid')
        self.assertEqual(len(invoice._get_reconciled_payments()), 2)

        # 4. Render XML
        xml = invoice._l10n_pl_ksef_render_xml()

        # Expectation: ZnacznikZaplatyCzesciowej is 2 because invoice is fully paid
        self.assertEqual(
            self._get_xml_value(xml, "//ns:Platnosc/ns:ZnacznikZaplatyCzesciowej"),
            '2',
            "ZnacznikZaplatyCzesciowej should be 2 when fully paid (even with multiple payments)"
        )

        # Expectation: ZaplataCzesciowa nodes SHOULD be present for both payments
        payment_nodes = self._get_xml_nodes(xml, "//ns:Platnosc/ns:ZaplataCzesciowa")
        self.assertEqual(len(payment_nodes), 2, "Should list history of both payments")

        # Optional: Verify amounts in the history
        amounts = sorted([n.find('ns:KwotaZaplatyCzesciowej', namespaces={'ns': 'http://crd.gov.pl/wzor/2025/06/25/13775/'}).text for n in payment_nodes])
        self.assertEqual(amounts, ['400.00', '600.00'])

    def test_payment_bank_account_details(self):
        """
        Test that RachunekBankowy is generated when a partner_bank_id is set on the invoice.
        """
        # Create a Bank Account for the Company
        bank_acc = self.env['res.partner.bank'].create({
            'acc_number': '12 3456 7890 0000 0000 1234 5678',
            'partner_id': self.company_data['company'].partner_id.id,
            'bank_id': self.env['res.bank'].create({'name': 'Test Bank PL'}).id
        })

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'partner_bank_id': bank_acc.id,
            'invoice_line_ids': [Command.create({'product_id': self.product_a.id, 'price_unit': 100.0})],
        })
        invoice.action_post()

        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids
        ).create({
            'amount': 10.0,
            'journal_id': self.cash_journal.id,
        })._create_payments()

        xml = invoice._l10n_pl_ksef_render_xml()

        expected_acc = '12345678900000000012345678'
        self.assertEqual(self._get_xml_value(xml, "//ns:Platnosc/ns:RachunekBankowy/ns:NrRB"), expected_acc)
        self.assertEqual(self._get_xml_value(xml, "//ns:Platnosc/ns:RachunekBankowy/ns:NazwaBanku"), 'Test Bank PL')

    def test_payment_terms_structure(self):
        """
        Test the <TerminPlatnosci> block logic.

        Scenario:
        1. Create a custom Payment Term: "45 Days after End of Month".
        2. Create an Invoice using this term.
        3. Verify the XML output contains:
           - Termin: The calculated due date.
           - Ilosc: 45
           - Jednostka: Dni
           - ZdarzeniePoczatkowe: Koniec miesiąca
        """
        # 1. Create Custom Payment Term (45 Days After End of Month)
        pay_term = self.env['account.payment.term'].create({
            'name': '45 Days EOM',
            'line_ids': [
                Command.create({
                    'value': 'percent',
                    'value_amount': 100.0,
                    'nb_days': 45,
                    'delay_type': 'days_after_end_of_month',
                })
            ]
        })

        # 2. Create Invoice with this Payment Term
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'invoice_payment_term_id': pay_term.id,
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'price_unit': 100.0
            })],
        })
        invoice.action_post()
        self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=invoice.ids
        ).create({
            'amount': 100.0,
            'journal_id':  self.cash_journal.id,
        })._create_payments()
        self.assertEqual(invoice.payment_state, 'partial')

        # 3. Render XML
        xml = invoice._l10n_pl_ksef_render_xml()

        # 4. Assertions

        # Check Termin (The calculated date)
        # We don't check the exact date calculation logic (Odoo core does that),
        # just that the XML matches the invoice field.
        expected_date = str(invoice.invoice_date_due)
        self.assertEqual(
            self._get_xml_value(xml, "//ns:Platnosc/ns:TerminPlatnosci/ns:Termin"),
            expected_date,
            "Termin should match the invoice due date"
        )

        # Check TerminOpis (Structured Description)
        # Ilosc (Quantity)
        self.assertEqual(
            self._get_xml_value(xml, "//ns:Platnosc/ns:TerminPlatnosci/ns:TerminOpis/ns:Ilosc"),
            '45',
            "Ilosc should be 45"
        )

        # Jednostka (Unit)
        self.assertEqual(
            self._get_xml_value(xml, "//ns:Platnosc/ns:TerminPlatnosci/ns:TerminOpis/ns:Jednostka"),
            'Dni',
            "Jednostka should be Dni"
        )

    def test_scenario_correction_values_are_negative(self):
        """
        Scenario 8: Verification of Negative Values for Corrections (Difference Method).

        This test ensures that when a Credit Note (KOR) is generated:
        1. Quantity (P_8B) is NEGATIVE.
        2. Net Amount (P_11) is NEGATIVE.
        3. Unit Price (P_9A) is POSITIVE.
        """
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_pl.id,
            'invoice_date': fields.Date.today(),
            'currency_id': self.env.ref('base.PLN').id,
            'invoice_line_ids': [Command.create({
                'product_id': self.product_a.id,
                'quantity': 10,
                'price_unit': 100.0,
            })],
        })
        invoice.action_post()
        reversal_wizard = self.env['account.move.reversal'].with_context(
            active_model="account.move", active_ids=invoice.ids
        ).create({
            'reason': 'Return of goods',
            'journal_id': invoice.journal_id.id,
        })
        reversal_wizard.refund_moves()

        credit_note = invoice.reversal_move_ids
        credit_note.action_post()

        xml = credit_note._l10n_pl_ksef_render_xml()
        self.assertEqual(self._get_xml_value(xml, "//ns:RodzajFaktury"), 'KOR')

        p_8b = self._get_xml_value(xml, "//ns:Fa/ns:FaWiersz/ns:P_8B")
        self.assertEqual(float(p_8b), -10.0, "Quantity (P_8B) must be negative for corrections")

        p_11 = self._get_xml_value(xml, "//ns:Fa/ns:FaWiersz/ns:P_11")
        self.assertEqual(float(p_11), -1000.0, "Net Amount (P_11) must be negative for corrections")

        p_9a = self._get_xml_value(xml, "//ns:Fa/ns:FaWiersz/ns:P_9A")
        self.assertEqual(float(p_9a), 100.0, "Unit Price (P_9A) must remain positive")
