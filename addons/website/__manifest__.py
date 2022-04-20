# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Website',
    'category': 'Website/Website',
    'sequence': 20,
    'summary': 'Enterprise website builder',
    'website': 'https://www.odoo.com/app/website',
    'version': '1.0',
    'description': "",
    'depends': [
        'digest',
        'web',
        'web_editor',
        'http_routing',
        'portal',
        'social_media',
        'auth_signup',
        'mail',
        'google_recaptcha',
        'utm',
    ],
    'installable': True,
    'data': [
        # security.xml first, data.xml need the group to exist (checking it)
        'security/website_security.xml',
        'security/ir.model.access.csv',
        'data/ir_asset.xml',
        'data/ir_cron_data.xml',
        'data/mail_mail_data.xml',
        'data/website_data.xml',
        'data/website_visitor_cron.xml',
        'data/digest_data.xml',
        'views/assets.xml',
        'views/website_templates.xml',
        'views/website_navbar_templates.xml',
        'views/snippets/snippets.xml',
        'views/snippets/s_title.xml',
        'views/snippets/s_cover.xml',
        'views/snippets/s_text_image.xml',
        'views/snippets/s_image_text.xml',
        'views/snippets/s_banner.xml',
        'views/snippets/s_text_block.xml',
        'views/snippets/s_features.xml',
        'views/snippets/s_three_columns.xml',
        'views/snippets/s_picture.xml',
        'views/snippets/s_carousel.xml',
        'views/snippets/s_alert.xml',
        'views/snippets/s_card.xml',
        'views/snippets/s_share.xml',
        'views/snippets/s_social_media.xml',
        'views/snippets/s_rating.xml',
        'views/snippets/s_hr.xml',
        'views/snippets/s_facebook_page.xml',
        'views/snippets/s_image_gallery.xml',
        'views/snippets/s_countdown.xml',
        'views/snippets/s_product_catalog.xml',
        'views/snippets/s_comparisons.xml',
        'views/snippets/s_company_team.xml',
        'views/snippets/s_call_to_action.xml',
        'views/snippets/s_references.xml',
        'views/snippets/s_popup.xml',
        'views/snippets/s_faq_collapse.xml',
        'views/snippets/s_features_grid.xml',
        'views/snippets/s_tabs.xml',
        'views/snippets/s_table_of_content.xml',
        'views/snippets/s_chart.xml',
        'views/snippets/s_parallax.xml',
        'views/snippets/s_quotes_carousel.xml',
        'views/snippets/s_numbers.xml',
        'views/snippets/s_masonry_block.xml',
        'views/snippets/s_media_list.xml',
        'views/snippets/s_showcase.xml',
        'views/snippets/s_timeline.xml',
        'views/snippets/s_process_steps.xml',
        'views/snippets/s_text_highlight.xml',
        'views/snippets/s_progress_bar.xml',
        'views/snippets/s_blockquote.xml',
        'views/snippets/s_badge.xml',
        'views/snippets/s_color_blocks_2.xml',
        'views/snippets/s_product_list.xml',
        'views/snippets/s_mega_menu_multi_menus.xml',
        'views/snippets/s_mega_menu_menu_image_menu.xml',
        'views/snippets/s_mega_menu_thumbnails.xml',
        'views/snippets/s_mega_menu_little_icons.xml',
        'views/snippets/s_mega_menu_images_subtitles.xml',
        'views/snippets/s_mega_menu_menus_logos.xml',
        'views/snippets/s_mega_menu_odoo_menu.xml',
        'views/snippets/s_mega_menu_big_icons_subtitles.xml',
        'views/snippets/s_mega_menu_cards.xml',
        'views/snippets/s_google_map.xml',
        'views/snippets/s_map.xml',
        'views/snippets/s_dynamic_snippet.xml',
        'views/snippets/s_dynamic_snippet_carousel.xml',
        'views/snippets/s_embed_code.xml',
        'views/snippets/s_website_form.xml',
        'views/snippets/s_searchbar.xml',
        'views/website_views.xml',
        'views/website_visitor_views.xml',
        'views/res_config_settings_views.xml',
        'views/website_rewrite.xml',
        'views/ir_actions_views.xml',
        'views/ir_asset_views.xml',
        'views/ir_attachment_views.xml',
        'views/ir_model_views.xml',
        'views/res_partner_views.xml',
        'wizard/base_language_install_views.xml',
        'wizard/website_robots.xml',

        # Old snippets
        ],
    'demo': [
        'data/website_demo.xml',
        'data/website_visitor_demo.xml',
    ],
    'application': True,
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_frontend': [
            ('replace', 'web/static/src/legacy/js/public/public_root_instance.js', 'website/static/src/js/content/website_root_instance.js'),
            'website/static/src/scss/website.scss',
            'website/static/src/scss/website.ui.scss',
            'website/static/src/scss/website.navbar.scss',
            'website/static/src/scss/website.navbar.mobile.scss',
            'website/static/src/js/utils.js',
            'website/static/src/js/content/website_root.js',
            'website/static/src/js/widgets/dialog.js',
            'website/static/src/js/widgets/fullscreen_indication.js',
            'website/static/src/js/content/compatibility.js',
            'website/static/src/js/content/menu.js',
            'website/static/src/js/content/snippets.animation.js',
            'website/static/src/js/menu/navbar.js',
            'website/static/src/js/show_password.js',
            'website/static/src/js/post_link.js',
            'website/static/src/js/user_custom_javascript.js',
            'website/static/src/js/editor_helper.js',
        ],
        'web.assets_frontend_minimal': [
            'website/static/src/js/content/inject_dom.js',
            'website/static/src/js/content/auto_hide_menu.js',
            'website/static/src/js/content/redirect.js',
        ],
        'web.assets_frontend_lazy': [
            # Remove assets_frontend_minimal
            ('remove', 'website/static/src/js/content/inject_dom.js'),
            ('remove', 'website/static/src/js/content/auto_hide_menu.js'),
            ('remove', 'website/static/src/js/content/redirect.js'),
        ],
        'web._assets_primary_variables': [
            'website/static/src/scss/primary_variables.scss',
            'website/static/src/scss/options/user_values.scss',
            'website/static/src/scss/options/colors/user_color_palette.scss',
            'website/static/src/scss/options/colors/user_gray_color_palette.scss',
            'website/static/src/scss/options/colors/user_theme_color_palette.scss',
        ],
        'web._assets_secondary_variables': [
            ('prepend', 'website/static/src/scss/secondary_variables.scss'),
        ],
        'web.assets_tests': [
            'website/static/tests/tours/**/*',
        ],
        'web.assets_backend': [
            ('include', 'web_editor.assets_wysiwyg'),
            ('include', 'website.assets_wysiwyg'),
            'website/static/src/scss/view_hierarchy.scss',
            'website/static/src/scss/website.backend.scss',
            'website/static/src/scss/website_visitor_views.scss',
            'website/static/src/scss/website.theme_install.scss',
            'website/static/src/js/backend/button.js',
            'website/static/src/js/backend/dashboard.js',
            'website/static/src/js/backend/res_config_settings.js',
            'website/static/src/js/backend/view_hierarchy.js',
            'website/static/src/js/widget_iframe.js',
            'website/static/src/js/theme_preview_kanban.js',
            'website/static/src/js/theme_preview_form.js',
            'website/static/src/client_actions/*/*.js',
            'website/static/src/client_actions/*/*.scss',
            'website/static/src/services/website_service.js',
            'website/static/src/components/navbar/navbar.js',
            'website/static/src/components/editor/editor.js',
            'website/static/src/components/editor/editor.scss',
            'website/static/src/components/ace_editor/ace_editor.js',
            'website/static/src/components/ace_editor/ace_editor.scss',
            'website/static/src/components/dialog/*.js',
            'website/static/src/components/dialog/*.scss',
            'website/static/src/components/switch/switch.js',
            'website/static/src/components/switch/switch.scss',
            'website/static/src/components/webclient/webclient.js',
            'website/static/src/components/webclient/webclient.scss',
            'website/static/src/components/wysiwyg_adapter/wysiwyg_adapter.js',
            'website/static/src/components/wysiwyg_adapter/page_options.js',
            'website/static/src/js/form_editor_registry.js',
            'website/static/src/js/tours/tour_utils.js',
            'website/static/src/components/fullscreen_indication/fullscreen_indication.js',
            'website/static/src/components/fullscreen_indication/fullscreen_indication.scss',
            'website/static/src/components/media_dialog/image_selector.js',
            'website/static/src/systray_items/*.js',
            'website/static/src/systray_items/*.scss',
            'website/static/src/js/utils.js',
            'website/static/src/client_actions/configurator/configurator.js',
            'website/static/src/client_actions/configurator/configurator.scss',
            'website/static/src/components/translator/*',
        ],
        'web.qunit_suite_tests': [
            'website/static/tests/dashboard_tests.js',
            'website/static/tests/website_tests.js',
        ],
        'web._assets_frontend_helpers': [
            ('prepend', 'website/static/src/scss/bootstrap_overridden.scss'),
        ],
        'website.assets_wysiwyg': [
            ('include', 'web._assets_helpers'),
            'web_editor/static/src/scss/bootstrap_overridden.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'website/static/src/scss/website.wysiwyg.scss',
            'website/static/src/js/editor/editor.js',
            'website/static/src/js/editor/snippets.editor.js',
            'website/static/src/js/editor/snippets.options.js',
            'website/static/src/snippets/s_facebook_page/options.js',
            'website/static/src/snippets/s_image_gallery/options.js',
            'website/static/src/snippets/s_countdown/options.js',
            'website/static/src/snippets/s_masonry_block/options.js',
            'website/static/src/snippets/s_popup/options.js',
            'website/static/src/snippets/s_product_catalog/options.js',
            'website/static/src/snippets/s_chart/options.js',
            'website/static/src/snippets/s_rating/options.js',
            'website/static/src/snippets/s_tabs/options.js',
            'website/static/src/snippets/s_progress_bar/options.js',
            'website/static/src/snippets/s_blockquote/options.js',
            'website/static/src/snippets/s_showcase/options.js',
            'website/static/src/snippets/s_table_of_content/options.js',
            'website/static/src/snippets/s_timeline/options.js',
            'website/static/src/snippets/s_media_list/options.js',
            'website/static/src/snippets/s_google_map/options.js',
            'website/static/src/snippets/s_map/options.js',
            'website/static/src/snippets/s_dynamic_snippet/options.js',
            'website/static/src/snippets/s_dynamic_snippet_carousel/options.js',
            'website/static/src/snippets/s_embed_code/options.js',
            'website/static/src/snippets/s_website_form/options.js',
            'website/static/src/snippets/s_searchbar/options.js',
            'website/static/src/snippets/s_social_media/options.js',
            'website/static/src/snippets/s_process_steps/options.js',
            'website/static/src/js/editor/wysiwyg.js',
            'website/static/src/js/editor/widget_link.js',
            'website/static/src/js/widgets/link_popover_widget.js',
        ],
        'website.assets_editor_frontend': [
            ('include', 'web._assets_helpers'),
            'web_editor/static/src/scss/bootstrap_overridden.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'web_editor/static/src/scss/wysiwyg.scss',
            'website/static/src/scss/website.edit_mode.scss',
            'web/static/lib/nearest/jquery.nearest.js',
            'web_editor/static/lib/odoo-editor/src/style.css',
            'web_editor/static/lib/odoo-editor/src/utils/constants.js',
            'web_editor/static/lib/odoo-editor/src/utils/sanitize.js',
            'web_editor/static/lib/odoo-editor/src/utils/serialize.js',
            'web_editor/static/lib/odoo-editor/src/utils/DOMPurify.js',
            'web_editor/static/lib/odoo-editor/src/tablepicker/TablePicker.js',
            'web_editor/static/lib/odoo-editor/src/commands/align.js',
            'web_editor/static/lib/odoo-editor/src/commands/commands.js',
            'web_editor/static/lib/odoo-editor/src/commands/deleteBackward.js',
            'web_editor/static/lib/odoo-editor/src/commands/deleteForward.js',
            'web_editor/static/lib/odoo-editor/src/commands/enter.js',
            'web_editor/static/lib/odoo-editor/src/commands/shiftEnter.js',
            'web_editor/static/lib/odoo-editor/src/commands/shiftTab.js',
            'web_editor/static/lib/odoo-editor/src/commands/tab.js',
            'web_editor/static/lib/odoo-editor/src/commands/toggleList.js',
        ],
        'website.assets_editor': [
            ('include', 'web._assets_helpers'),
            'web/static/lib/bootstrap/scss/_variables.scss',
            'web/static/src/legacy/scss/ace.scss',
            'website/static/src/scss/website.editor.ui.scss',
            'website/static/src/scss/website.theme_install.scss',
            'website/static/src/js/menu/content.js',
            'website/static/src/js/menu/customize.js',
            'website/static/src/js/menu/debug_menu.js',
            'website/static/src/js/menu/edit.js',
            'website/static/src/js/menu/mobile_view.js',
            'website/static/src/js/menu/seo.js',
            'website/static/src/js/set_view_track.js',
            'website/static/src/js/tours/homepage.js',
            'website/static/src/js/tours/tour_utils.js',
        ],
        'web.assets_qweb': [
            'website/static/src/xml/website.backend.xml',
            'website/static/src/xml/website_widget.xml',
            'website/static/src/xml/theme_preview.xml',
            'website/static/src/components/dialog/*',
            'website/static/src/components/webclient/webclient.xml',
            'website/static/src/components/editor/editor.xml',
            'website/static/src/client_actions/*/*.xml',
            'website/static/src/systray_items/*.xml',
            'website/static/src/components/translator/*.xml',
            'website/static/src/components/navbar/navbar.xml',
        ],
        'website.test_bundle': [
            '/web/static/lib/qweb/qweb2.js',
            'http://test.external.link/javascript1.js',
            '/web/static/lib/jquery.ui/jquery-ui.css',
            'http://test.external.link/style1.css',
            '/web/static/src/boot.js',
            'http://test.external.link/javascript2.js',
            'http://test.external.link/style2.css',
        ],
    },
    'license': 'LGPL-3',
}
