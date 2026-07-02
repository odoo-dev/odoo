from itertools import product

from odoo.tests import tagged, TransactionCase
from odoo.tests.common import decorator


def main_company_countries(*country_codes):
    """ Decorate a method to execute it once for each given country """
    @decorator
    def _main_company_countries(func, *args, **kwargs):
        self = args[0]
        old_country_id = self.main_company.partner_id.country_id
        try:
            # retrieve countries
            Countries = self.env['res.country'].with_context(active_test=False)
            countries = {
                country.code: country
                for country in Countries.search([('code', 'in', list(country_codes))])
            }
            for country_code, country_id in countries.items():
                with self.subTest(country_code=country_code):
                    self.main_company.partner_id.country_id = country_id
                    func(*args, **kwargs)
                self.env.invalidate_all()
        finally:
            self.main_company.partner_id.country_id = old_country_id

    return _main_company_countries


@tagged('post_install', '-at_install')
class TestKpiProvider(TransactionCase):

    def setUp(self):
        super().setUp()

        self.main_company = self.env.ref('base.main_company')
        other_companies = self.env['res.company'].search([('id', '!=', self.main_company.id)])
        self.env['res.users'].search([('company_id', 'in', other_companies.ids)]).active = False
        other_companies.active = False

        self.expected_value_by_peppol_proxy_state = {
            'not_registered': 'not_done',
            'rejected': 'not_done',
            'sender': 'not_done',
            'in_verification': 'incomplete',
            'smp_registration': 'incomplete',
            'receiver': 'done',
        }

    @main_company_countries('US', 'LU', 'IT', 'CN')
    def test_default_kpi_summary(self):
        self.assertCountEqual(self.env['kpi.provider'].get_account_peppol_kpi_summary(), [])

    def test_check_all_possible_peppol_proxy_states_are_covered(self):
        expected = {s[0] for s in self.env['res.company']._fields['account_peppol_proxy_state'].selection}
        actual = set(self.expected_value_by_peppol_proxy_state)
        self.assertEqual(actual, expected,
                         f"Missing states: {expected - actual}; "
                         f"Extra states: {actual - expected}")

    def test_kpi_summary_with_multiple_companies(self):
        other_company = self.env['res.company'].create({'name': 'Other LTD'})
        self.main_company.partner_id.country_id = other_company.partner_id.country_id = self.env.ref('base.be')

        table_of_truth = {
            ('not_registered', 'not_registered'):       'not_done',
            ('not_registered', 'rejected'):             'not_done',
            ('not_registered', 'sender'):               'not_done',
            ('not_registered', 'in_verification'):      'incomplete',
            ('not_registered', 'smp_registration'):     'incomplete',
            ('not_registered', 'receiver'):             'incomplete',

            ('rejected', 'not_registered'):             'not_done',
            ('rejected', 'rejected'):                   'not_done',
            ('rejected', 'sender'):                     'not_done',
            ('rejected', 'in_verification'):            'incomplete',
            ('rejected', 'smp_registration'):           'incomplete',
            ('rejected', 'receiver'):                   'incomplete',

            ('sender', 'not_registered'):               'not_done',
            ('sender', 'rejected'):                     'not_done',
            ('sender', 'sender'):                       'not_done',
            ('sender', 'in_verification'):              'incomplete',
            ('sender', 'smp_registration'):             'incomplete',
            ('sender', 'receiver'):                     'incomplete',

            ('in_verification', 'not_registered'):      'incomplete',
            ('in_verification', 'rejected'):            'incomplete',
            ('in_verification', 'sender'):              'incomplete',
            ('in_verification', 'in_verification'):     'incomplete',
            ('in_verification', 'smp_registration'):    'incomplete',
            ('in_verification', 'receiver'):            'incomplete',

            ('smp_registration', 'not_registered'):     'incomplete',
            ('smp_registration', 'rejected'):           'incomplete',
            ('smp_registration', 'sender'):             'incomplete',
            ('smp_registration', 'in_verification'):    'incomplete',
            ('smp_registration', 'smp_registration'):   'incomplete',
            ('smp_registration', 'receiver'):           'incomplete',

            ('receiver', 'not_registered'):             'incomplete',
            ('receiver', 'rejected'):                   'incomplete',
            ('receiver', 'sender'):                     'incomplete',
            ('receiver', 'in_verification'):            'incomplete',
            ('receiver', 'smp_registration'):           'incomplete',
            ('receiver', 'receiver'):                   'done',
        }

        actual_keys = set(table_of_truth)
        expected_keys = set(product((s[0] for s in self.env['res.company']._fields['account_peppol_proxy_state'].selection), repeat=2))
        self.assertEqual(actual_keys, expected_keys,
                         f"Missing table of truth keys: {expected_keys - actual_keys}; "
                         f"Extra table of truth keys: {actual_keys - expected_keys}")

        for (proxy_state1, proxy_state2), expected_value in table_of_truth.items():
            with self.subTest(proxy_state1=proxy_state1, proxy_state2=proxy_state2):
                self.main_company.account_peppol_proxy_state = proxy_state1
                other_company.account_peppol_proxy_state = proxy_state2

                self.assertCountEqual(self.env['kpi.provider'].get_account_peppol_kpi_summary(), [{
                    'id': 'account_peppol.proxy_state',
                    'name': 'KYC',
                    'type': 'kyc_status',
                    'value': expected_value,
                }])

    @main_company_countries('BE')
    def test_kpi_summary_peppol_proxy_states_be(self):
        for proxy_state, expected_value in self.expected_value_by_peppol_proxy_state.items():
            with self.subTest(proxy_state=proxy_state):
                self.main_company.account_peppol_proxy_state = proxy_state

                self.assertCountEqual(self.env['kpi.provider'].get_account_peppol_kpi_summary(), [{
                    'id': 'account_peppol.proxy_state',
                    'name': 'KYC',
                    'type': 'kyc_status',
                    'value': expected_value,
                }])

    @main_company_countries('FR', 'GP', 'MQ', 'RE')
    def test_kpi_summary_peppol_proxy_states_fr(self):
        self.main_company.partner_id.peppol_eas = '0208'

        for proxy_state, expected_value in self.expected_value_by_peppol_proxy_state.items():
            with self.subTest(proxy_state=proxy_state):
                self.main_company.account_peppol_proxy_state = proxy_state

                self.assertCountEqual(self.env['kpi.provider'].get_account_peppol_kpi_summary(), [{
                    'id': 'account_peppol.proxy_state',
                    'name': 'KYC',
                    'type': 'kyc_status',
                    'value': 'not_done',
                }])

        self.main_company.partner_id.peppol_eas = '0225'

        for proxy_state, expected_value in self.expected_value_by_peppol_proxy_state.items():
            with self.subTest(proxy_state=proxy_state):
                self.main_company.account_peppol_proxy_state = proxy_state

                self.assertCountEqual(self.env['kpi.provider'].get_account_peppol_kpi_summary(), [{
                    'id': 'account_peppol.proxy_state',
                    'name': 'KYC',
                    'type': 'kyc_status',
                    'value': expected_value,
                }])
