from odoo.exceptions import UserError
from odoo.tests import Form
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestResPartner(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.usa, cls.france, cls.italy = [
            cls.env.ref(f'base.{x}')
            for x in ('us', 'fr', 'it')
        ]

    def test_validate_fiscal_code(self):
        valid_codes = [
            "AORTHV05P30V295L",
            "SPDTHB43S93F42VH",
            "MDRTUV99H14X2MNU",
            "XPTDRX73R64YPLUD",
            "LOLXDR40T3MZRTSV",
            "GJTIUG55DLQZRTSS",
            "CDEOTG5PBLQZRTSE",
            "PERTLELPALQZRTSN",
            "IT12345678887",
            "IT12345670546",
            "IT95286931217",
            "IT95867361206",
            "IT94567689990",
            "12345670546",
            "95286931217",
            "95867361206",
            "94567689990",
        ]

        invalid_codes = [
            "AORTHV05P34V295U",
            "SPDTHB43O93F42VH",
            "MDRTUVV9H14X2MNU",
            "XPTDRX73RS4YPLUD",
            "LOLXDRQ0T3QZRTSJ",
            "GJTIUGR5DLQZRTSS",
            "CDEOTG5PBLQZRTSS",
            "PERTLEZPALQZRTSN",
            "IT12345678901",
            "IT12345678885",
            "IT45689349992",
            "IT78239131204",
            "IT45692151219",
            "12345678901",
            "12345678885",
            "45689349992",
            "78239131204",
            "45692151219",
        ]

        partners = self.env['res.partner']

        for i, code in enumerate(invalid_codes):
            with self.assertRaises(UserError):
                partners += self.env['res.partner'].create({'name': f'partner_{i}', 'additional_identifiers': {'IT_CF': code}})

        for i, code in enumerate(valid_codes):
            partners += self.env['res.partner'].create({'name': f'partner_{i}', 'additional_identifiers': {'IT_CF': code}})

        self.assertEqual(len(partners), len(valid_codes))

    def test_partner_l10n_it_codice_fiscale(self):
        vat_partner = self.env['res.partner'].create({
            'name': 'Customer with VAT',
        })

        partner_form = Form(vat_partner)

        partner_form.vat = 'IT12345676017'
        self.assertEqual((partner_form.additional_identifiers or {}).get('IT_CF'), '12345676017', "We give the Partner a VAT, IT_CF is given accordingly")

        partner_form.country_id = self.env.ref('base.ir')
        self.assertFalse((partner_form.additional_identifiers or {}).get('IT_CF'), "Partner is given Iran as country, IT_CF is removed")

        partner_form.country_id = self.env.ref('base.it')
        self.assertEqual((partner_form.additional_identifiers or {}).get('IT_CF'), '12345676017', "The partner was given the wrong country, we correct it to Italy")

        partner_form.vat = 'IT12345670017'
        self.assertEqual((partner_form.additional_identifiers or {}).get('IT_CF'), '12345670017', "There was a typo in the VAT, changing it should change IT_CF as well")

    def _test_normalized_data(self, testdata):
        prefix = "normalized_"
        partner = self.env['res.partner'].create({'name': 'partner'})
        for testentry in testdata:
            with self.subTest(testentry=testentry):
                write_vals = {}
                for k, v in testentry.items():
                    if k.startswith(prefix):
                        continue
                    if k in ('IT_CF', 'IT_IPA'):
                        write_vals.setdefault('additional_identifiers', {})
                        if v:
                            write_vals['additional_identifiers'][k] = v
                    elif isinstance(v, str | int | float | bool) or v is False:
                        write_vals[k] = v
                    else:
                        write_vals[k] = v.id
                partner.write(write_vals)
                l10n_it_edi_values = partner._l10n_it_edi_get_values()
                for field, expected in [
                    (k[len(prefix):], v)
                    for k, v in testentry.items()
                    if k.startswith(prefix)
                ]:
                    self.assertEqual(expected, l10n_it_edi_values.get(field))

    def test_normalized_pa_index_and_zip(self):
        self._test_normalized_data([
            {
                'country_id': self.italy,
                'zip': '20100',
                'IT_IPA': '1234567',
                'normalized_pa_index': '1234567',
                'normalized_zip': '20100',
            },
            {
                'country_id': self.france,
                'IT_IPA': '1234567',
                'zip': '33344',
                'normalized_pa_index': 'XXXXXXX',
                'normalized_zip': '00000',
            },
        ])

    def test_normalized_country_and_vat(self):
        self._test_normalized_data([
            {
                'country_id': self.usa,
                'vat': '911-92-3333',
                'IT_CF': False,
                'normalized_country_code': 'US',
                'normalized_vat': '911-92-3333',
            },
            {
                'country_id': self.france,
                'vat': 'FR 13542107651',
                'IT_CF': False,
                'normalized_country_code': 'FR',
                'normalized_vat': '13542107651',
            },
            {
                'country_id': self.usa,
                'vat': False,
                'IT_CF': False,
                'normalized_country_code': 'US',
                'normalized_vat': 'OO99999999999',
            },
            {
                'country_id': self.france,
                'vat': False,
                'IT_CF': False,
                'normalized_country_code': 'FR',
                'normalized_vat': '0000000',
            },
            {
                'country_id': self.italy,
                'vat': False,
                'IT_CF': False,
                'normalized_country_code': 'IT',
                'normalized_vat': False,
            },
            {
                'country_id': self.italy,
                'vat': 'IT06289781004',
                'IT_CF': 'IT06289781004',
                'normalized_country_code': 'IT',
                'normalized_codice_fiscale': '06289781004',
                'normalized_vat': '06289781004',
            },
            {
                'country_id': False,
                'vat': False,
                'IT_CF': 'MRTMTT91D08F205J',
                'normalized_codice_fiscale': 'MRTMTT91D08F205J',
                'normalized_country_code': 'IT',
                'normalized_vat': False,
            },
        ])

    def test_create_company(self):
        """Test that when creating a company from an individual, IT identifiers are propagated"""
        individual_partner = self.env['res.partner'].create({
            'parent_name': 'Mario Bros. Plumbing',
            'name': 'Mario',
            'additional_identifiers': {'IT_CF': '12345670546', 'IT_IPA': '1231231'},
        })
        self.assertRecordValues(individual_partner.parent_id, [{
            'name': 'Mario Bros. Plumbing',
            'additional_identifiers': {'IT_CF': '12345670546', 'IT_IPA': '1231231'},
        }])
