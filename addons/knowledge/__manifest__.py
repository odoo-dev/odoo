# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Knowledge',
    'summary': 'Centralize, manage, share and grow your knowledge library',
    'description': 'Centralize, manage, share and grow your knowledge library',
    'category': 'Productivity/Knowledge',
    'version': '0.1',
    'depends': [
        'web',
        'web_editor',
        'mail',
        'portal'
    ],
    'data': [
        'data/knowledge_data.xml',
        'data/ir_actions_data.xml',
        'data/mail_templates.xml',
        'wizard/knowledge_invite_views.xml',
        'views/knowledge_article_views.xml',
        'views/knowledge_article_favorite_views.xml',
        'views/knowledge_article_member_views.xml',
        'views/knowledge_templates.xml',
        'views/knowledge_templates_common.xml',
        'views/knowledge_templates_frontend.xml',
        'views/knowledge_menus.xml',
        'security/ir.model.access.csv',
        'security/ir_rule.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
    'assets': {
        'web.assets_backend': [
            ('remove', 'web_editor/static/src/scss/web_editor.backend.scss'),
            'web/static/fonts/fonts.scss',
            'knowledge/static/src/components/*/*.scss',
            'knowledge/static/src/components/*/*.js',
            'knowledge/static/src/scss/knowledge_views.scss',
            'knowledge/static/src/scss/knowledge_editor.scss',
            'knowledge/static/src/scss/knowledge_blocks.scss',
            'knowledge/static/src/components/*/*.js',
            'knowledge/static/src/js/knowledge_controller.js',
            'knowledge/static/src/js/knowledge_renderers.js',
            'knowledge/static/src/js/knowledge_views.js',
            'knowledge/static/src/js/widgets/knowledge_dialogs.js',
            'knowledge/static/src/js/tools/tree_panel_mixin.js',
            'knowledge/static/src/js/widgets/knowledge_permission_panel.js',
            'knowledge/static/src/js/widgets/knowledge_emoji_picker.js',
            'knowledge/static/src/webclient/commands/*.js',
            'knowledge/static/src/models/*/*.js',
        ],
        'web.assets_frontend': [
            'knowledge/static/src/scss/knowledge_frontend.scss',
            'knowledge/static/src/scss/knowledge_blocks.scss',
            'knowledge/static/src/js/knowledge_frontend.js',
            'knowledge/static/src/js/tools/tree_panel_mixin.js',
        ],
        'web.assets_qweb': [
            'knowledge/static/src/components/*/*.xml',
            'knowledge/static/src/xml/knowledge_templates.xml',
            'knowledge/static/src/xml/chatter_topbar.xml',
            'knowledge/static/src/xml/knowledge_command_palette.xml',
        ],
        'web.assets_tests': [
            'knowledge/static/tests/tours/*.js',
        ],
        'web.qunit_suite_tests': [
            'knowledge/static/src/tests/test_services.js',
        ],
    },
}
