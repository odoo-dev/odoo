# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Argentinian Accounting',
    'version': '12.0.1.0.0',
    'description': """
Argentinian accounting chart and tax localization.
==================================================

* Define Argentinian chart of accounts:
  * Responsable Inscripto (RI)
  * Exento (EX)
  * Monotributo (Mono)

* Define Argentinian Taxes
* Define Fiscal Positions
* AFIP Legal Documents
* Add AFIP Codes for models
    * Currency
    * Country
    * Product Unit of Measure
    * Tax Group

Follow the next configuration steps

1. Go to your company and configure your CUIT number and AFIP Responsability
2. Go to Invoicing / Configuration and set the Chart of Account you will like
   to use.
3. Create your sale journals taking into account AFIP info if needed.
""",
    'author': 'ADHOC SA',
    'category': 'Localization',
    'depends': [
        'l10n_latam_document',
        'l10n_ar_base',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/l10n_ar_afip_responsability_type_data.xml',
        'data/account_account_tag_data.xml',
        'data/account_chart_base.xml',
        'data/account_chart_exento.xml',
        'data/account_chart_respinsc.xml',
        'data/account_tax_group.xml',
        'data/account_tax_template_data.xml',
        'data/account_fiscal_template.xml',
        'data/uom_uom_data.xml',
        'data/l10n_latam.document.type.csv',
        # NOTE: we load as csv but we made them not update True with a hook
        'data/res_partner_data.xml',
        'data/res_currency_data.xml',
        'data/res_country_data.xml',
        'data/product_product_data.xml',
        'views/account_move_line_view.xml',
        'views/account_move_view.xml',
        'views/res_partner_view.xml',
        'views/res_company_view.xml',
        'views/afip_menuitem.xml',
        'views/l10n_ar_afip_responsability_type_view.xml',
        'views/res_currency_view.xml',
        'views/account_fiscal_position_view.xml',
        'views/uom_uom_view.xml',
        'views/account_journal_view.xml',
        'views/account_invoice_view.xml',
        'views/l10n_latam_document_type_view.xml',
        'views/ir_sequence_view.xml',
        'views/report_invoice.xml',
    ],
    'demo': [
        'demo/exento_demo.xml',
        'demo/mono_demo.xml',
        'demo/respinsc_demo.xml',
        'demo/res_users_demo.xml',
    ],
    'post_init_hook': 'post_init_hook',
}
