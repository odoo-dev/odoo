from odoo import fields, models

# Chart template xmlids of the taxes activated by each regime; the taxes of the other regimes are archived.
# A tax listed under several regimes is active when the current regime lists it.
L10N_UZ_ALWAYS_ACTIVE_TAX_XMLIDS = (
    'l10n_uz_tax_sale_exempt',
    'l10n_uz_tax_purchase_exempt',
)
L10N_UZ_REGIME_TAX_XMLIDS = {
    'general': (
        'l10n_uz_tax_sale_12',
        'l10n_uz_tax_sale_12_kkm',
        'l10n_uz_tax_sale_12_marketplace',
        'l10n_uz_tax_sale_12_other',
        'l10n_uz_tax_sale_zero_rated',
        'l10n_uz_tax_sale_0',
        'l10n_uz_tax_sale_0_agriculture',
        'l10n_uz_tax_purchase_12',
        'l10n_uz_tax_purchase_12_high_risk',
        'l10n_uz_tax_purchase_12_import',
        'l10n_uz_tax_purchase_12_import_base',
        'l10n_uz_tax_12_excluded',
        'l10n_uz_tax_12_additional',
    ),
    'simplified_vat': (
        'l10n_uz_tax_sale_6',
        'l10n_uz_tax_sale_6_kkm',
        'l10n_uz_tax_sale_6_marketplace',
        'l10n_uz_tax_sale_6_other',
        'l10n_uz_tax_sale_6_export',
    ),
    'turnover': (
        'l10n_uz_tax_sale_turnover_esf',
        'l10n_uz_tax_sale_turnover_kkm',
        'l10n_uz_tax_sale_turnover_marketplace',
        'l10n_uz_tax_sale_turnover_other',
        'l10n_uz_tax_turnover_deemed_sale',
        'l10n_uz_tax_sale_zero_rated',
    ),
}

# Default (sale, purchase) taxes per regime, as chart template xmlids.
L10N_UZ_REGIME_DEFAULT_TAXES = {
    'general': ('l10n_uz_tax_sale_12', 'l10n_uz_tax_purchase_12'),
    'simplified_vat': ('l10n_uz_tax_sale_6', False),
    'turnover': (False, False),
}


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_uz_tax_regime = fields.Selection(
        selection=[
            ('general', "Standard VAT (12%)"),
            ('simplified_vat', "Simplified VAT (6%)"),
            ('turnover', "Turnover Income Taxation"),
        ],
        string="Tax Regime",
        default='general',
    )
    l10n_uz_turnover_tax_rate = fields.Selection(
        selection=[
            ('1', "1%"),
            ('3', "3%"),
            ('4', "4%"),
        ],
        string="Turnover Income Tax Rate",
        default='4',
    )

    def write(self, vals):
        res = super().write(vals)
        if 'l10n_uz_tax_regime' in vals:
            self.filtered(lambda c: c.chart_template == 'uz')._l10n_uz_apply_tax_regime()
        return res

    def _l10n_uz_get_regime_default_taxes(self, regime):
        """ Return the (sale, purchase) default taxes of the given regime for this company.
        A tax is ``None`` when its template record is missing, meaning it should be left untouched.
        """
        self.ensure_one()
        ChartTemplate = self.env['account.chart.template'].with_company(self)
        return tuple(
            ChartTemplate.ref(xmlid, raise_if_not_found=False) if xmlid else self.env['account.tax']
            for xmlid in L10N_UZ_REGIME_DEFAULT_TAXES[regime]
        )

    def _l10n_uz_apply_tax_regime(self):
        for company in self:
            regime = company.l10n_uz_tax_regime or 'general'
            sale_tax, purchase_tax = company._l10n_uz_get_regime_default_taxes(regime)
            vals = {}
            if sale_tax is not None:
                vals['account_sale_tax_id'] = sale_tax.id
            if purchase_tax is not None:
                vals['account_purchase_tax_id'] = purchase_tax.id
            if vals:
                company.write(vals)

            ChartTemplate = self.env['account.chart.template'].with_company(company)
            active_xmlids = {*L10N_UZ_ALWAYS_ACTIVE_TAX_XMLIDS, *L10N_UZ_REGIME_TAX_XMLIDS[regime]}
            all_xmlids = active_xmlids.union(*L10N_UZ_REGIME_TAX_XMLIDS.values())
            for xmlid in all_xmlids:
                tax = ChartTemplate.ref(xmlid, raise_if_not_found=False)
                is_active = xmlid in active_xmlids
                if tax and tax.active != is_active:
                    tax.active = is_active
