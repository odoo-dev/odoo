{
    'name': "Electronic invoicing: UBL (Peppol, XRechnung, NLCIUS, ...)",
    'category': 'Accounting/Accounting',
    'description': """
UBL electronic invoicing
========================

Allows to export and import invoices using the OASIS Universal Business Language (UBL 2.1) syntax.

The formats are layered as in their specifications:

* ``account.edi.ubl``: the UBL 2.1 syntax (Invoice, CreditNote, DebitNote), the base of every UBL format
  (also used by the localizations relying on a national UBL customization: OIOUBL, DIAN, ZATCA, ...);
* ``account.edi.ubl_cen_en16931``: the EN 16931-3-2 UBL syntax binding, i.e. the EN 16931 business rules
  (``account.edi.cen_en16931``) expressed in UBL as checked by the CEN validation artefacts (UBL-CR, UBL-SR, BR),
  the base of the national EN 16931 CIUS not transported as Peppol BIS (France, Croatia, Romania, Serbia, ...);
* ``account.edi.ubl_pint``: the Peppol International model (PINT), specialized by jurisdiction (A-NZ, SG, JP, ...);
* ``account.edi.ubl_pint_eu``: PINT EU, the European specialization of PINT, in the EN 16931 UBL binding
  (``account.edi.ubl_cen_en16931``);
* ``account.edi.xml.ubl_bis3``: Peppol BIS Billing 3.0 (EHF 3 in Norway), which shares the PINT EU semantic
  model, specialized by the national CIUS: XRechnung (Germany), NLCIUS (Netherlands), A-NZ and SG BIS 3.

When generating the PDF on the invoice, the PDF is embedded inside the UBL XML. This allows the receiver to retrieve
the PDF with only the XML file.

Note that XRechnung and NLCIUS are only suggested for German and Dutch partners, respectively. Peppol BIS 3 is the
default for the countries of the `EAS list <https://docs.peppol.eu/poacc/billing/3.0/codelist/eas/>`_.
    """,
    'depends': ['account_edi_cii'],
    'data': [
        'data/ir_config_parameter_data.xml',
        'report/account_edi_ubl_report_templates.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'uninstall_hook': 'uninstall_hook',
}
