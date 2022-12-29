# -*- coding: utf-8 -*-
{
    'name': 'eLearning',
    'version': '2.6',
    'sequence': 125,
    'summary': 'Manage and publish an eLearning platform',
    'website': 'https://www.odoo.com/app/elearning',
    'category': 'Website/eLearning',
    'description': """
Create Online Courses
=====================

Featuring

 * Integrated course and lesson management
 * Fullscreen navigation
 * Support Youtube videos, Google documents, PDF, images, articles
 * Test knowledge with quizzes
 * Filter and Tag
 * Statistics
""",
    'depends': [
        'portal_rating',
        'website',
        'website_mail',
        'website_profile',
    ],
    'data': [
        'security/website_slides_security.xml',
        'security/ir.model.access.csv',
        'views/gamification_karma_tracking_views.xml',
        'views/res_config_settings_views.xml',
        'views/res_partner_views.xml',
        'views/rating_rating_views.xml',
        'views/slide_embed_views.xml',
        'views/slide_question_views.xml',
        'views/slide_slide_partner_views.xml',
        'views/slide_slide_views.xml',
        'views/slide_channel_partner_views.xml',
        'views/slide_channel_views.xml',
        'views/slide_channel_tag_views.xml',
        'views/slide_snippets.xml',
        'views/website_slides_menu_views.xml',
        'views/website_slides_templates_homepage.xml',
        'views/website_slides_templates_course.xml',
        'views/website_slides_templates_lesson.xml',
        'views/website_slides_templates_lesson_fullscreen.xml',
        'views/website_slides_templates_lesson_embed.xml',
        'views/website_slides_templates_profile.xml',
        'views/website_slides_templates_utils.xml',
        'views/website_pages_views.xml',
        'views/slide_channel_add.xml',
        'wizard/slide_channel_invite_views.xml',
        'data/gamification_data.xml',
        'data/mail_activity_type_data.xml',
        'data/mail_message_subtype_data.xml',
        'data/mail_template_data.xml',
        'data/mail_templates.xml',
        'data/slide_data.xml',
        'data/website_data.xml',
    ],
    'demo': [
        'data/res_users_demo.xml',
        'data/slide_channel_tag_demo.xml',
        'data/slide_channel_demo.xml',
        'data/slide_slide_demo.xml',
        'data/slide_user_demo.xml',
        'data/slide_user_gamification_demo.xml',
    ],
    'installable': True,
    'application': True,
    'assets': {
        'web.assets_backend': [
            'website_slides/static/src/backend/**/*',
            'website_slides/static/src/slide_category_one2many_field.js',
            'website_slides/static/src/slide_category_list_renderer.js',
            'website_slides/static/src/scss/slide_views.scss',
            'website_slides/static/src/js/tours/slides_tour.js',
            'website_slides/static/src/js/components/**/*.js',
        ],
        'web.assets_frontend': [
            'website_slides/static/src/scss/website_slides.scss',
            'website_slides/static/src/scss/website_slides_profile.scss',
            'website_slides/static/src/scss/slides_slide_fullscreen.scss',
            'website_slides/static/src/js/slides.js',
            'website_slides/static/src/js/slides_share.js',
            'website_slides/static/src/js/slides_upload.js',
            'website_slides/static/src/js/slides_category_add.js',
            'website_slides/static/src/js/slides_category_delete.js',
            'website_slides/static/src/js/slides_slide_archive.js',
            'website_slides/static/src/js/slides_slide_toggle_is_preview.js',
            'website_slides/static/src/js/slides_slide_like.js',
            'website_slides/static/src/js/slides_course_page.js',
            'website_slides/static/src/js/slides_course_slides_list.js',
            'website_slides/static/src/js/slides_course_fullscreen_player.js',
            'website_slides/static/src/js/slides_course_join.js',
            'website_slides/static/src/js/slides_course_enroll_email.js',
            'website_slides/static/src/js/slides_course_quiz.js',
            'website_slides/static/src/js/slides_course_quiz_question_form.js',
            'website_slides/static/src/js/slides_course_quiz_finish.js',
            'website_slides/static/src/js/slides_course_tag_add.js',
            'website_slides/static/src/js/slides_course_unsubscribe.js',
            'website_slides/static/src/js/portal_chatter.js',
            'website_slides/static/src/xml/website_slides_sidebar.xml',
            'website_slides/static/src/xml/website_slides_upload.xml',
            'website_slides/static/src/xml/website_slides_fullscreen.xml',
            'website_slides/static/src/xml/website_slides_share.xml',
            'website_slides/static/src/xml/website_slides_channel_tag.xml',
            'website_slides/static/src/xml/website_slides_unsubscribe.xml',
            'website_slides/static/src/xml/slide_management.xml',
            'website_slides/static/src/xml/slide_course_join.xml',
            'website_slides/static/src/xml/slide_quiz_create.xml',
            'website_slides/static/src/xml/slide_quiz.xml',
        ],
        'website.assets_editor': [
            'website_slides/static/src/js/systray_items/*.js',
        ],
        'web.assets_tests': [
            'website_slides/static/tests/tours/*.js',
        ],
        'website_slides.slide_embed_assets': [
            # TODO this bundle now includes 'assets_common' files directly, but
            # most of these files are useless in this context, clean this up.
            ('include', 'web._assets_helpers'),

            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',

            'web/static/src/legacy/scss/tempusdominus_overridden.scss',
            'web/static/lib/tempusdominus/tempusdominus.scss',
            'web/static/lib/jquery.ui/jquery-ui.css',
            'web/static/src/libs/fontawesome/css/font-awesome.css',
            'web/static/lib/odoo_ui_icons/*',
            'web/static/lib/select2/select2.css',
            'web/static/lib/select2-bootstrap-css/select2-bootstrap.css',
            'web/static/lib/daterangepicker/daterangepicker.css',
            'web/static/src/webclient/navbar/navbar.scss',
            'web/static/src/legacy/scss/ui.scss',
            'web/static/src/legacy/scss/mimetypes.scss',
            'web/static/src/legacy/scss/modal.scss',
            'web/static/src/legacy/scss/animation.scss',
            'web/static/src/legacy/scss/datepicker.scss',
            'web/static/src/legacy/scss/daterangepicker.scss',
            'web/static/src/legacy/scss/banner.scss',
            'web/static/src/legacy/scss/colorpicker.scss',
            'web/static/src/legacy/scss/popover.scss',
            'web/static/src/legacy/scss/translation_dialog.scss',
            'web/static/src/legacy/scss/keyboard.scss',
            'web/static/src/legacy/scss/name_and_signature.scss',
            'web/static/src/legacy/scss/web.zoomodoo.scss',
            'web/static/src/legacy/scss/fontawesome_overridden.scss',

            'web/static/src/legacy/js/promise_extension.js',
            'web/static/src/boot.js',
            'web/static/src/session.js',
            'web/static/src/legacy/js/core/cookie_utils.js',

            'web/static/lib/underscore/underscore.js',
            'web/static/lib/underscore.string/lib/underscore.string.js',
            'web/static/lib/moment/moment.js',
            'web/static/lib/luxon/luxon.js',
            'web/static/lib/owl/owl.js',
            'web/static/lib/owl/odoo_module.js',
            'web/static/src/owl2_compatibility/*.js',
            'web/static/src/legacy/js/component_extension.js',
            'web/static/src/legacy/legacy_component.js',
            'web/static/lib/jquery/jquery.js',
            'web/static/lib/jquery.ui/jquery-ui.js',
            'web/static/lib/jquery/jquery.browser.js',
            'web/static/lib/jquery.blockUI/jquery.blockUI.js',
            'web/static/lib/jquery.hotkeys/jquery.hotkeys.js',
            'web/static/lib/jquery.placeholder/jquery.placeholder.js',
            'web/static/lib/jquery.form/jquery.form.js',
            'web/static/lib/jquery.ba-bbq/jquery.ba-bbq.js',
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
            'web/static/lib/tempusdominus/tempusdominus.js',
            'web/static/lib/select2/select2.js',
            'web/static/lib/clipboard/clipboard.js',
            'web/static/lib/jSignature/jSignatureCustom.js',
            'web/static/lib/qweb/qweb2.js',
            'web/static/src/legacy/js/assets.js',
            'web/static/src/legacy/js/libs/autocomplete.js',
            'web/static/src/legacy/js/libs/bootstrap.js',
            'web/static/src/legacy/js/libs/content-disposition.js',
            'web/static/src/legacy/js/libs/download.js',
            'web/static/src/legacy/js/libs/jquery.js',
            'web/static/src/legacy/js/libs/moment.js',
            'web/static/src/legacy/js/libs/underscore.js',
            'web/static/src/legacy/js/libs/pdfjs.js',
            'web/static/src/legacy/js/libs/zoomodoo.js',
            'web/static/src/legacy/js/libs/jSignatureCustom.js',
            'web/static/src/legacy/js/core/abstract_service.js',
            'web/static/src/legacy/js/core/abstract_storage_service.js',
            'web/static/src/legacy/js/core/ajax.js',
            'web/static/src/legacy/js/core/browser_detection.js',
            'web/static/src/legacy/js/core/bus.js',
            'web/static/src/legacy/js/core/class.js',
            'web/static/src/legacy/js/core/collections.js',
            'web/static/src/legacy/js/core/concurrency.js',
            'web/static/src/legacy/js/core/dialog.js',
            'web/static/src/legacy/xml/dialog.xml',
            'web/static/src/legacy/js/core/owl_dialog.js',
            'web/static/src/legacy/js/core/popover.js',
            'web/static/src/legacy/js/core/dom.js',
            'web/static/src/legacy/js/core/local_storage.js',
            'web/static/src/legacy/js/core/mixins.js',
            'web/static/src/legacy/js/core/qweb.js',
            'web/static/src/legacy/js/core/ram_storage.js',
            'web/static/src/legacy/js/core/registry.js',
            'web/static/src/legacy/js/core/rpc.js',
            'web/static/src/legacy/js/core/service_mixins.js',
            'web/static/src/legacy/js/core/session.js',
            'web/static/src/legacy/js/core/session_storage.js',
            'web/static/src/legacy/js/core/time.js',
            'web/static/src/legacy/js/core/translation.js',
            'web/static/src/legacy/js/core/utils.js',
            'web/static/src/legacy/js/core/widget.js',
            'web/static/src/legacy/js/services/ajax_service.js',
            'web/static/src/legacy/js/services/config.js',
            'web/static/src/legacy/js/services/core.js',
            'web/static/src/legacy/js/services/local_storage_service.js',
            'web/static/src/legacy/js/services/session_storage_service.js',
            'web/static/src/legacy/js/common_env.js',
            'web/static/src/legacy/js/widgets/name_and_signature.js',
            'web/static/src/legacy/xml/name_and_signature.xml',
            'web/static/src/legacy/js/core/smooth_scroll_on_drag.js',
            'web/static/src/legacy/js/widgets/colorpicker.js',
            'web/static/src/legacy/xml/colorpicker.xml',
            'web/static/src/legacy/js/widgets/translation_dialog.js',
            'web/static/src/legacy/xml/translation_dialog.xml',
            'web/static/src/core/**/*.js',
            'web/static/src/env.js',
            'web/static/src/legacy/js/services/session.js',

            ('include', 'web._assets_helpers'),
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            ('include', 'web._assets_bootstrap'),
            'website_slides/static/src/scss/website_slides.scss',
            ('include', 'web.pdf_js_lib'),
            'website_slides/static/lib/pdfslidesviewer/PDFSlidesViewer.js',
            'website_slides/static/src/js/slides_embed.js',
        ],
        'web.tests_assets': [
            'website_slides/static/tests/helpers/*.js',
        ],
        'web.qunit_suite_tests': [
            'website_slides/static/tests/new/**/*.js',
        ],
    },
    'license': 'LGPL-3',
}
