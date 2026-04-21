from odoo import tools, Command
from odoo.tests.common import tagged
from odoo.addons.l10n_hu_edi.tests.common import L10nHuEdiTestCommon

import datetime


@tagged('post_install_l10n', '-at_install', 'post_install')
class L10nHuEdiTestCurrencyRate(L10nHuEdiTestCommon):

    def test_delivery_date_currency_rate_sync(self):
        """
        Test that changing the delivery_date (the exchange rate date in Hungary)
        correctly triggers a recomputation of the currency rate and
        synchronizes the journal items' balances.
        """
        currency_eur = self.env.ref('base.EUR')
        out_invoice = self.create_invoice_simple(currency=currency_eur)

        current_eur_rate = out_invoice.get_currency_rate(self.env.company.id, currency_eur.id, self.today)
        expected_huf_base = tools.float_round(10000 / current_eur_rate, self.currency.decimal_places)
        expected_huf_vat = tools.float_round((10000 * self.tax_vat.amount / 100) / current_eur_rate, self.currency.decimal_places)

        previous_day_eur_rate = out_invoice.get_currency_rate(self.env.company.id, currency_eur.id, self.today - datetime.timedelta(days=1))
        previous_expected_huf_base = tools.float_round(10000 / previous_day_eur_rate, self.currency.decimal_places)
        previous_expected_huf_vat = tools.float_round((10000 * self.tax_vat.amount / 100) / previous_day_eur_rate, self.currency.decimal_places)

        lines = out_invoice.line_ids

        self.assertEqual(out_invoice.delivery_date, self.today)
        self.assertRecordValues(lines, [
            {'balance': -expected_huf_base, 'currency_rate': current_eur_rate},
            {'balance': -expected_huf_vat, 'currency_rate': current_eur_rate},
            {'balance': expected_huf_base + expected_huf_vat, 'currency_rate': current_eur_rate},
        ])

        out_invoice.delivery_date = False
        self.assertRecordValues(lines, [
            {'balance': -expected_huf_base, 'currency_rate': current_eur_rate},
            {'balance': -expected_huf_vat, 'currency_rate': current_eur_rate},
            {'balance': expected_huf_base + expected_huf_vat, 'currency_rate': current_eur_rate},
        ])

        out_invoice.delivery_date = self.today - datetime.timedelta(days=1)
        self.assertRecordValues(lines, [
            {'balance': -previous_expected_huf_base, 'currency_rate': previous_day_eur_rate},
            {'balance': -previous_expected_huf_vat, 'currency_rate': previous_day_eur_rate},
            {'balance': previous_expected_huf_base + previous_expected_huf_vat, 'currency_rate': previous_day_eur_rate},
        ])

        out_invoice.delivery_date = self.today
        self.assertRecordValues(lines, [
            {'balance': -expected_huf_base, 'currency_rate': current_eur_rate},
            {'balance': -expected_huf_vat, 'currency_rate': current_eur_rate},
            {'balance': expected_huf_base + expected_huf_vat, 'currency_rate': current_eur_rate},
        ])

    def test_hu_invoice_currency_rate_round_globally(self):
        """This is a variant of test_invoice_currency_rate_round_globally to unsure it's working with other exchange rate main fields"""

        self.env.company.tax_calculation_rounding_method = 'round_globally'
        currency_eur = self.env.ref('base.EUR')
        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'currency_id': currency_eur.id,
            'delivery_date': self.today,
            'invoice_line_ids': [
                Command.create({
                    'name': 'test line',
                    'quantity': 0.80,
                    'price_unit': 894.34,
                }),
            ],
        })
        invoice.write({
            'invoice_date': self.today - datetime.timedelta(days=1),
            'invoice_currency_rate': 1 / 1189.5,
        })

        self.assertRecordValues(invoice.line_ids, [
            {'balance': -851053.94},
            {'balance': 851053.94},
        ])
