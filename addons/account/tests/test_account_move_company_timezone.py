from datetime import date

from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import freeze_time, tagged


# 18:00 on January 14 in New York, 08:00 on January 15 in Tokyo, 12:00 on January 15 in Auckland
NOW = '2026-01-14 23:00:00'
COMPANY_DAY = date(2026, 1, 14)
USER_DAY = date(2026, 1, 15)


@tagged('post_install', '-at_install')
class TestAccountMoveCompanyTimezone(AccountTestInvoicingCommon):
    """ Documents are dated in the timezone of their company, whoever posts them. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.company_data['company']
        cls.company.country_id = cls.env.ref('base.us')
        cls.company.tz = 'America/New_York'
        cls.env.user.tz = 'Asia/Tokyo'

    def _create_undated_invoice(self):
        return self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_a.id,
            'invoice_line_ids': [Command.create({'name': 'line', 'price_unit': 100.0})],
        })

    @freeze_time(NOW)
    def test_invoice_date_company_day(self):
        invoice = self._create_undated_invoice()
        invoice.action_post()
        self.assertRecordValues(invoice, [{'invoice_date': COMPANY_DAY, 'date': COMPANY_DAY}])

    @freeze_time(NOW)
    def test_invoice_date_company_tz_outside_country(self):
        """ A timezone outside the country of the company is a guess: the user's day is used. """
        self.company.tz = 'Europe/London'
        self.assertTrue(self.company.tz_outside_country)
        invoice = self._create_undated_invoice()
        invoice.action_post()
        self.assertEqual(invoice.invoice_date, USER_DAY)

    @freeze_time(NOW)
    def test_post_entry_dated_company_tomorrow(self):
        """ An entry dated on the user's day, but tomorrow for the company, is posted tomorrow. """
        invoice = self.init_invoice('out_invoice', invoice_date=USER_DAY, amounts=[100])
        self.assertEqual(invoice._get_moves_requiring_confirmation(), invoice)
        invoice._post()
        self.assertRecordValues(invoice, [{'state': 'draft', 'auto_post': 'at_date'}])

    @freeze_time(NOW)
    def test_autopost_company_day(self):
        """ The cron posts the entries of each company once its own day is reached. """
        company_nz = self.setup_other_company(name='NZ Company')['company']
        company_nz.country_id = self.env.ref('base.nz')
        company_nz.tz = 'Pacific/Auckland'
        invoice_us = self.init_invoice('out_invoice', invoice_date=USER_DAY, amounts=[100])
        invoice_nz = self.init_invoice('out_invoice', invoice_date=USER_DAY, amounts=[100], company=company_nz)
        (invoice_us + invoice_nz).auto_post = 'at_date'

        with self.enter_registry_test_mode():
            self.env.ref('account.ir_cron_auto_post_draft_entry').method_direct_trigger()

        self.assertRecordValues(invoice_us + invoice_nz, [{'state': 'draft'}, {'state': 'posted'}])

    @freeze_time(NOW)
    def test_payment_date_company_day(self):
        self.assertEqual(self.env['account.payment'].default_get(['date'])['date'], COMPANY_DAY)
        invoice = self.init_invoice('out_invoice', invoice_date=COMPANY_DAY, amounts=[100], post=True)
        wizard = self.env['account.payment.register'].with_context(active_model='account.move', active_ids=invoice.ids).create({})
        self.assertEqual(wizard.payment_date, COMPANY_DAY)
