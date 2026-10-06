from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.l10n_uz.models.res_company import L10N_UZ_ALWAYS_ACTIVE_TAX_XMLIDS, L10N_UZ_REGIME_TAX_XMLIDS
from odoo.tests import Form, tagged


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nUzTaxRegime(AccountTestInvoicingCommon):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('uz')
    def setUpClass(cls):
        super().setUpClass()
        ChartTemplate = cls.env['account.chart.template']
        cls.sale_12 = ChartTemplate.ref('l10n_uz_tax_sale_12')
        cls.purchase_12 = ChartTemplate.ref('l10n_uz_tax_purchase_12')
        cls.sale_6 = ChartTemplate.ref('l10n_uz_tax_sale_6')

    def _assert_active_taxes(self, regime):
        ChartTemplate = self.env['account.chart.template']
        active_xmlids = {*L10N_UZ_ALWAYS_ACTIVE_TAX_XMLIDS, *L10N_UZ_REGIME_TAX_XMLIDS[regime]}
        for xmlid in active_xmlids.union(*L10N_UZ_REGIME_TAX_XMLIDS.values()):
            self.assertEqual(ChartTemplate.ref(xmlid).active, xmlid in active_xmlids, f"{xmlid} under {regime}")

    def test_tax_regime_switch(self):
        company = self.env.company
        other_company = self.setup_other_company()['company']
        self._assert_active_taxes('general')
        self.assertEqual(company.account_sale_tax_id, self.sale_12)
        self.assertEqual(company.account_purchase_tax_id, self.purchase_12)

        for regime, sale_tax, purchase_tax in (
            ('turnover', self.env['account.tax'], self.env['account.tax']),
            ('simplified_vat', self.sale_6, self.env['account.tax']),
            ('general', self.sale_12, self.purchase_12),
        ):
            with self.subTest(regime=regime):
                company.l10n_uz_tax_regime = regime
                self.assertEqual(company.account_sale_tax_id, sale_tax)
                self.assertEqual(company.account_purchase_tax_id, purchase_tax)
                self._assert_active_taxes(regime)
                self.assertTrue(self.env['account.chart.template'].with_company(other_company).ref('l10n_uz_tax_sale_12').active)

    def test_tax_regime_reload(self):
        company = self.env.company
        company.l10n_uz_tax_regime = 'turnover'
        self.env['account.chart.template'].try_loading('uz', company, force_create=False)
        self._assert_active_taxes('turnover')
        self.assertFalse(company.account_sale_tax_id)
        self.assertFalse(company.account_purchase_tax_id)

    def test_tax_regime_settings_onchange(self):
        with Form(self.env['res.config.settings']) as settings:
            settings.l10n_uz_tax_regime = 'turnover'
            self.assertFalse(settings.sale_tax_id)
            self.assertFalse(settings.purchase_tax_id)
        settings.save().execute()
        self.assertFalse(self.env.company.account_sale_tax_id)
        self.assertFalse(self.env.company.account_purchase_tax_id)
