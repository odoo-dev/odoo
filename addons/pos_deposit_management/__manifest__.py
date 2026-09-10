# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'POS Deposit Management',
    'category': 'Sales/Point Of Sale',
    'summary': 'Module to add deposit line for products having deposit products',
    'depends': ['point_of_sale'],
    'data': [
            'data/pos_deposit_management_data.xml',
            'views/res_config_settings_views.xml',
            'views/pos_config_views.xml',
            'views/product_view.xml',
            ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_deposit_management/static/src/overrides/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'uninstall_hook': 'uninstall_hook',
}
