# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Pos Self-Order Extended',
    'version': '1.0',
    'category': 'Point of Sale',
    'sequence': 6,
    'summary': 'Adds American style tipping to Stripe',
    'depends': ['pos_self_order'],
    # 'auto_install': True,
    'data': [
        'views/pos_ticket_view.xml'
    ],
    'assets': {
        'pos_self_order.assets': [
            'pos_self_order_extended/static/src/override/**/*',
            'mail/static/src/core/common/sound_effects_service.js',
            'point_of_sale/static/src/app/services/number_buffer_service.js',
            'point_of_sale/static/src/app/components/popups/number_popup/**/*',
            'point_of_sale/static/src/app/components/numpad/**/*',
            'point_of_sale/static/src/app/utils/make_awaitable_dialog.js',
        ],
        'web.assets_frontend': [
            'pos_self_order_extended/static/src/interaction/**/*',
            'point_of_sale/static/src/app/utils/html-to-image.js',
            'point_of_sale/static/src/utils.js',
            'point_of_sale/static/src/app/services/render_service.js',
        ]
    },
    'author': 'Meet Jivani',
    'license': 'LGPL-3',
}
