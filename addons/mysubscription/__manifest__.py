{
    'name': 'My Subscription',
    'summary': 'Backend Subscription App',
    'category': 'Sales',
    'license': 'LGPL-3',
    'author': 'Odoo S.A.',
    'depends': ['base', 'web', 'iap'],
    'data': [
        # 'views/menus.xml',
        'views/mysubscription.xml',
    ],
    'assets': {
        # 'web.assets_backend': [
        #     'mysubscription/static/src/**/*.js',
        #     'mysubscription/static/src/**/*.xml',
        #     'mysubscription/static/src/**/*.scss',
        # ],
        'mysubscription.assets': [
            ('include', 'web.icons_fonts'),
            ('include', 'web._assets_helpers'),
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'web/static/lib/bootstrap/scss/_variables-dark.scss',
            'web/static/lib/bootstrap/scss/_maps.scss',

            ('include', 'web._assets_bootstrap'),
            ('include', 'web._assets_core'),

            'mysubscription/static/src/**/*.js',
            'mysubscription/static/src/**/*.xml',
            'mysubscription/static/src/**/*.scss',
        ],
    },
    'bootstrap': True,
}
