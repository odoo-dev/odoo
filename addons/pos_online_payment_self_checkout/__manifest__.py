# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'POS Self-Checkout / Online Payment',
    'category': 'Sales/Point of Sale',
    'summary': 'Support online payment in self-checkout',
    'depends': ['pos_online_payment', 'pos_self_checkout'],
    'auto_install': True,
    'assets': {
        'pos_self_checkout.assets': [
            'pos_online_payment_self_checkout/static/src/app/components/scanning_page/scanning_page.xml',
            'pos_online_payment_self_checkout/static/src/app/components/scanning_page/scanning_page.scss',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
