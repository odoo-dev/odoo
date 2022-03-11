# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Knowledge",
    'summary': 'Centralise, manage, share and grow your knowledge library',
    'description': "Centralise, manage, share and grow your knowledge library",
    'category': 'Knowledge',
    'version': '0.1',
    'depends': [
        'web',
        'web_editor',
        'mail'
    ],
    'data': [
        'data/knowledge_data.xml',
        'data/mail_template_data.xml',
        'views/knowledge_views.xml',
        'views/knowledge_templates.xml',
        'views/knowledge_templates_frontend.xml',
        'wizard/knowledge_invite_wizard.xml',
        'security/ir.model.access.csv',
        'security/security.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
    'assets': {
        'web.assets_backend': [
            'knowledge/static/src/components/*/*.scss',
            'knowledge/static/src/components/*/*.js',
            'knowledge/static/src/scss/knowledge_views.scss',
            'knowledge/static/src/js/knowledge_controller.js',
            'knowledge/static/src/js/knowledge_model.js',
            'knowledge/static/src/js/knowledge_renderers.js',
            'knowledge/static/src/js/knowledge_views.js',
            'knowledge/static/src/js/widgets/knowledge_dialogs.js',
            'knowledge/static/src/js/widgets/knowledge_permission_panel.js',
            'knowledge/static/src/js/widgets/knowledge_emoji_picker.js',
            'knowledge/static/src/webclient/commands/*.js',
            'knowledge/static/src/models/*/*.js',
            'knowledge/static/src/js/form_controller.js',
            'knowledge/static/src/js/form_renderer.js',
            'knowledge/static/src/js/knowledge_macros.js',
            'knowledge/static/src/js/knowledge_behaviors.js',
            'knowledge/static/src/js/knowledge_toolbars.js',
            'knowledge/static/src/js/knowledge_field_html_injector.js',
            'knowledge/static/src/js/knowledge_plugin.js',
            'knowledge/static/src/js/field_html.js',
            'knowledge/static/src/js/knowledge_service.js',
        ],
        'web.assets_frontend': [
            'knowledge/static/src/scss/knowledge_views.scss',
            'knowledge/static/src/js/knowledge_frontend.js',
        ],
        'web_editor.assets_wysiwyg': [
            'knowledge/static/src/js/wysiwyg/knowledge_article_link.js',
            'knowledge/static/src/js/wysiwyg.js',
            'knowledge/static/src/js/knowledge_toolbars_edit.js',
            'knowledge/static/src/js/knowledge_clipboard_whitelist.js'
        ],
        'web.assets_qweb': [
            'knowledge/static/src/components/*/*.xml',
            'knowledge/static/src/xml/knowledge_editor.xml',
            'knowledge/static/src/xml/knowledge_templates.xml',
            'knowledge/static/src/xml/chatter_topbar.xml',
            'knowledge/static/src/xml/knowledge_toolbars.xml',
        ],
    },
}
