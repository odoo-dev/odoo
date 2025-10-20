# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Benchmark for PDF Generation",
    'version': '1.0',
    'category': 'Tools',
    'sequence': 350,
    'summary': "Benchmark for PDF Generation",
    'description': " ",
    'depends': [
        "test_l10n_be_hr_payroll_account",
        "account_avatax_sale",
        "sale_stock",
        "sale_management",
        "crm_sale_subscription",
    ],
    'data': [
    'views/data_generator_views.xml',
    ],
    'assets': {},
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'post_init_hook': 'post_init_pdf_benchmark',
}
