{
    'name': "Electronic invoicing: common framework and CII (Factur-X / ZUGFeRD)",
    'category': 'Accounting/Accounting',
    'description': """
Electronic invoicing framework
==============================

Base of the EN 16931 compliant electronic invoicing formats:

* the syntax independent helpers shared by every format (``account.edi.common``): collecting the invoice values,
  tax categories (UNCL 5305), exemption reasons (VATEX), partner identifiers (ISO 6523 / EAS), import pipeline...
* the business rules of the European semantic model EN 16931-1 (``account.edi.cen_en16931``), which are syntax
  independent and reused by both the CII and the UBL formats;
* the UN/CEFACT Cross Industry Invoice syntax (``account.edi.cii``) and the Factur-X / ZUGFeRD format
  (``account.edi.xml.cii``), a CII D16B XML following the EN 16931 profile, embedded in a PDF/A-3.

A Factur-X XML is always silently embedded in the invoice PDF, which makes the PDF importable by any other Odoo.
This is why this module is always installed. The UBL based formats (Peppol, XRechnung, ...) live in
``account_edi_ubl``.
    """,
    'depends': ['account'],
    'data': [
        'data/uom_data.xml',
        'data/pdfa_3_facturx_data.xml',
        'views/account_tax_views.xml',
        'views/account_move_views.xml',
        'views/res_partner_views.xml',
        'views/uom_uom_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'account_edi_cii/static/src/scss/**/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'uninstall_hook': 'uninstall_hook',
}
