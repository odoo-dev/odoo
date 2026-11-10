# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tests import TransactionCase, tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestResPartnerPG(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.country_pg = cls.env.ref('base.pg')

    def _create_partner(self, **vals):
        return self.env['res.partner'].create({'name': 'PG Partner', 'country_id': self.country_pg.id, **vals})

    def test_is_company_from_ipa(self):
        """ A PG partner is a company only when it has an IPA, even if it has a TIN. """
        individual = self._create_partner(vat='500123456')
        self.assertFalse(individual.is_company)

        company = self._create_partner(vat='500123456', additional_identifiers={'PG_IPA': '1-123456'})
        self.assertTrue(company.is_company)

        individual.additional_identifiers = {'PG_IPA': '1-654321'}
        self.assertTrue(individual.is_company)

        # Outside PG, the generic rule (a Tax ID makes a company) still applies.
        foreign = self.env['res.partner'].create({'name': 'SG Partner', 'country_id': self.env.ref('base.sg').id, 'vat': '197401143C'})
        self.assertTrue(foreign.is_company)

    def test_branch_follows_parent_ipa(self):
        parent = self._create_partner(additional_identifiers={'PG_IPA': '1-123456'})
        branch = self._create_partner(name='PG Branch', parent_id=parent.id)
        self.assertEqual(branch.additional_identifiers.get('PG_IPA'), '1-123456')
        self.assertFalse(branch.is_company)
