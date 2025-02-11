# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    "name": "Malaysia - E-invoicing (POS)",
    "countries": ["my"],
    "version": "1.0",
    "category": "Accounting/Localizations/EDI",
    "icon": "/account/static/description/l10n.png",
    "summary": "Consolidated E-invoicing using MyInvois",
    "description": """
    This modules allows the user to send consolidated invoices to the MyInvois system when using the POS app.
    """,
    "depends": ["l10n_my_edi", "point_of_sale"],
    "data": [
        "data/res_partner.xml",

        "security/ir.model.access.csv",

        "views/myinvois_document_pos_views.xml",
        "views/pos_order_views.xml",

        "wizard/myinvois_consolidate_invoice_wizard.xml",
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'l10n_my_edi_pos/static/src/**/*',
        ],
    },
    "installable": True,
    "author": "Odoo S.A.",
    "license": "LGPL-3",
}
