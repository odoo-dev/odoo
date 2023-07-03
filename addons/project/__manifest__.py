# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Project',
    'version': '1.3',
    'website': 'https://www.odoo.com/app/project',
    'category': 'Services/Project',
    'sequence': 45,
    'summary': 'Organize and plan your projects',
    'depends': [
        'analytic',
        'base_setup',
        'mail',
        'portal',
        'rating',
        'resource',
        'web',
        'web_tour',
        'digest',
    ],
    'data': [
        'security/project_security.xml',
        'security/ir.model.access.csv',
        'security/ir.model.access.xml',
        'data/digest_data.xml',
        'data/ir_actions_client_data.xml',
        'report/project_task_burndown_chart_report_views.xml',
        'views/account_analytic_account_views.xml',
        'views/digest_digest_views.xml',
        'views/rating_rating_views.xml',
        'views/project_update_views.xml',
        'views/project_update_templates.xml',
        'views/project_project_stage_views.xml',
        'wizard/project_share_wizard_views.xml',
        'views/project_collaborator_views.xml',
        'views/project_task_type_views.xml',
        'views/project_project_views.xml',
        'views/project_task_views.xml',
        'views/project_tags_views.xml',
        'views/project_milestone_views.xml',
        'views/res_partner_views.xml',
        'views/res_config_settings_views.xml',
        'views/mail_activity_type_views.xml',
        'views/project_sharing_project_task_views.xml',
        'views/project_portal_project_project_templates.xml',
        'views/project_portal_project_task_templates.xml',
        'views/project_task_templates.xml',
        'views/project_sharing_project_task_templates.xml',
        'report/project_report_views.xml',
        'data/ir_cron_data.xml',
        'data/mail_message_subtype_data.xml',
        'data/mail_template_data.xml',
        'data/project_data.xml',
        'wizard/project_task_type_delete_views.xml',
        'wizard/project_project_stage_delete_views.xml',
        'views/project_menus.xml',
    ],
    'demo': [
        'data/mail_template_demo.xml',
    ],
    'installable': True,
    'application': True,
    'post_init_hook': '_project_post_init',
    'assets': {
        'web.assets_backend': [
            'project/static/src/css/project.css',
            'project/static/src/utils/**/*',
            'project/static/src/components/**/*',
            'project/static/src/views/**/*',
            'project/static/src/js/tours/project.js',
            'project/static/src/scss/project_dashboard.scss',
            'project/static/src/scss/project_form.scss',
            'project/static/src/scss/project_widgets.scss',
            'project/static/src/xml/**/*',
        ],
        'web.assets_frontend': [
            'project/static/src/scss/portal_rating.scss',
            'project/static/src/scss/project_sharing_frontend.scss',
            'project/static/src/js/portal_rating.js',
        ],
        'web.qunit_suite_tests': [
            'project/static/tests/**/*.js',
        ],
        'web.assets_tests': [
            'project/static/tests/tours/**/*',
        ],
        'project.webclient': [
            ('include', 'web._assets_helpers'),
            ('include', 'web._assets_backend_helpers'),

            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',

            'web/static/lib/jquery.ui/jquery-ui.css',
            'web/static/src/libs/fontawesome/css/font-awesome.css',
            'web/static/lib/odoo_ui_icons/*',
            'web/static/lib/select2/select2.css',
            'web/static/lib/select2-bootstrap-css/select2-bootstrap.css',
            'web/static/src/webclient/navbar/navbar.scss',
            'web/static/src/scss/animation.scss',
            'web/static/src/core/colorpicker/colorpicker.scss',
            'web/static/src/scss/mimetypes.scss',
            'web/static/src/scss/ui.scss',
            'web/static/src/legacy/scss/ui.scss',
            'web/static/src/legacy/scss/modal.scss',
            'web/static/src/views/fields/translation_dialog.scss',
            'web/static/src/legacy/scss/name_and_signature.scss',
            'web/static/src/scss/fontawesome_overridden.scss',

            'web/static/src/legacy/js/promise_extension.js',
            'web/static/src/module_loader.js',
            'web/static/src/session.js',
            'web/static/src/legacy/js/core/cookie_utils.js',

            'web/static/lib/luxon/luxon.js',
            'web/static/lib/owl/owl.js',
            'web/static/lib/owl/odoo_module.js',
            'web/static/src/libs/owl.js',
            'web/static/lib/jquery/jquery.js',
            'web/static/lib/jquery.ui/jquery-ui.js',
            'web/static/lib/jquery.mjs.nestedSortable/jquery.mjs.nestedSortable.js',
            'web/static/lib/popper/popper.js',
            'web/static/lib/bootstrap/js/dist/dom/data.js',
            'web/static/lib/bootstrap/js/dist/dom/event-handler.js',
            'web/static/lib/bootstrap/js/dist/dom/manipulator.js',
            'web/static/lib/bootstrap/js/dist/dom/selector-engine.js',
            'web/static/lib/bootstrap/js/dist/base-component.js',
            'web/static/lib/bootstrap/js/dist/alert.js',
            'web/static/lib/bootstrap/js/dist/button.js',
            'web/static/lib/bootstrap/js/dist/carousel.js',
            'web/static/lib/bootstrap/js/dist/collapse.js',
            'web/static/lib/bootstrap/js/dist/dropdown.js',
            'web/static/lib/bootstrap/js/dist/modal.js',
            'web/static/lib/bootstrap/js/dist/offcanvas.js',
            'web/static/lib/bootstrap/js/dist/tooltip.js',
            'web/static/lib/bootstrap/js/dist/popover.js',
            'web/static/lib/bootstrap/js/dist/scrollspy.js',
            'web/static/lib/bootstrap/js/dist/tab.js',
            'web/static/lib/bootstrap/js/dist/toast.js',
            'web/static/lib/select2/select2.js',
            'web/static/lib/clipboard/clipboard.js',
            'web/static/lib/jSignature/jSignatureCustom.js',
            'web/static/src/legacy/js/libs/autocomplete.js',
            'web/static/src/legacy/js/libs/bootstrap.js',
            'web/static/src/legacy/js/libs/jquery.js',
            'web/static/src/legacy/js/libs/jSignatureCustom.js',
            'web/static/src/legacy/js/core/ajax.js',
            'web/static/src/legacy/js/core/bus.js',
            'web/static/src/legacy/js/core/class.js',
            'web/static/src/legacy/js/core/dialog.js',
            'web/static/src/legacy/xml/dialog.xml',
            'web/static/src/legacy/js/core/dom.js',
            'web/static/src/legacy/js/core/mixins.js',
            'web/static/src/legacy/js/core/rpc.js',
            'web/static/src/legacy/js/core/service_mixins.js',
            'web/static/src/legacy/js/core/time.js',
            'web/static/src/legacy/js/core/widget.js',
            'web/static/src/legacy/js/services/core.js',
            'web/static/src/legacy/js/common_env.js',
            'web/static/src/legacy/js/widgets/name_and_signature.js',
            'web/static/src/legacy/xml/name_and_signature.xml',
            ('include', 'web._assets_bootstrap_backend'),

            'base/static/src/css/modules.css',

            'web/static/src/core/utils/transitions.scss',
            'web/static/src/core/**/*',
            'web/static/src/model/**/*',
            'web/static/src/search/**/*',
            'web/static/src/webclient/icons.scss', # variables required in list_controller.scss
            'web/static/src/views/**/*.js',
            'web/static/src/views/*.xml',
            'web/static/src/views/*.scss',
            'web/static/src/views/fields/**/*',
            'web/static/src/views/form/**/*',
            'web/static/src/views/kanban/**/*',
            'web/static/src/views/list/**/*',
            'web/static/src/views/view_button/**/*',
            'web/static/src/views/view_components/**/*',
            'web/static/src/views/view_dialogs/**/*',
            'web/static/src/views/widgets/**/*',
            'web/static/src/webclient/**/*',
            ('remove', 'web/static/src/webclient/clickbot/clickbot.js'), # lazy loaded
            ('remove', 'web/static/src/views/form/button_box/*.scss'),
            ('remove', 'web/static/src/core/emoji_picker/emoji_data.js'),

            # remove the report code and whitelist only what's needed
            ('remove', 'web/static/src/webclient/actions/reports/**/*'),
            'web/static/src/webclient/actions/reports/*.js',
            'web/static/src/webclient/actions/reports/*.xml',

            'web/static/src/env.js',

            ('include', 'web_editor.assets_wysiwyg'),

            'web/static/src/legacy/scss/fields.scss',

            'base/static/src/scss/res_partner.scss',

            # Form style should be computed before
            'web/static/src/views/form/button_box/*.scss',

            'web/static/src/legacy/legacy_service_provider.js',
            'web/static/src/legacy/legacy_promise_error_handler.js',
            'web/static/src/legacy/legacy_rpc_error_handler.js',
            'web/static/src/legacy/legacy_setup.js',
            'web/static/src/legacy/backend_utils.js',
            'web/static/src/legacy/utils.js',
            'web/static/src/legacy/js/env.js',

            'web_editor/static/src/js/editor/odoo-editor/src/base_style.scss',
            'web_editor/static/lib/vkbeautify/**/*',
            'web_editor/static/src/js/common/**/*',
            'web_editor/static/src/js/editor/odoo-editor/src/utils/utils.js',
            'web_editor/static/src/js/wysiwyg/fonts.js',
            'web_editor/static/src/xml/ace.xml',

            'web_editor/static/src/components/**/*',
            'web_editor/static/src/scss/web_editor.common.scss',
            'web_editor/static/src/scss/web_editor.backend.scss',

            'web_editor/static/src/js/frontend/loader.js',
            'web_editor/static/src/js/backend/**/*',
            'web_editor/static/src/xml/backend.xml',

            'mail/static/src/scss/variables/*.scss',
            'mail/static/src/views/web/form/form_renderer.scss',

            'project/static/src/components/project_task_name_with_subtask_count_char_field/*',
            'project/static/src/components/project_task_state_selection/*',
            'project/static/src/components/project_many2one_field/*',
            'partner_autocomplete/static/src/js/partner_autocomplete_core.js',
            'partner_autocomplete/static/src/js/partner_autocomplete_many2one.js',
            'partner_autocomplete/static/src/xml/partner_autocomplete.xml',
            'project/static/src/views/project_task_form/*.scss',

            'project/static/src/project_sharing/search/favorite_menu/custom_favorite_item.xml',
            'project/static/src/project_sharing/**/*',
            'web/static/src/start.js',
            'web/static/src/legacy/legacy_setup.js',
        ],
    },
    'license': 'LGPL-3',
}
