# -*- coding: utf-8 -*-

{
    'name': 'Discuss',
    'version': '1.0',
    'category': 'Productivity/Discuss',
    'summary': 'Chat, mail gateway and private channels',
    'description': "",
    'website': 'https://www.odoo.com/page/discuss',
    'depends': ['base', 'base_setup', 'bus', 'web_tour'],
    'data': [
        'views/mail_menus.xml',
        'wizard/invite_view.xml',
        'wizard/mail_blacklist_remove_view.xml',
        'wizard/mail_compose_message_view.xml',
        'wizard/mail_resend_cancel_views.xml',
        'wizard/mail_resend_message_views.xml',
        'wizard/mail_template_preview_views.xml',
        'views/mail_message_subtype_views.xml',
        'views/mail_tracking_views.xml',
        'views/mail_notification_views.xml',
        'views/mail_message_views.xml',
        'views/mail_mail_views.xml',
        'views/mail_followers_views.xml',
        'views/mail_moderation_views.xml',
        'views/mail_channel_views.xml',
        'views/mail_shortcode_views.xml',
        'views/mail_activity_views.xml',
        'views/res_config_settings_views.xml',
        'data/mail_data.xml',
        'data/mail_channel_data.xml',
        'data/mail_activity_data.xml',
        'data/ir_cron_data.xml',
        'security/mail_security.xml',
        'security/ir.model.access.csv',
        'views/mail_alias_views.xml',
        'views/res_users_views.xml',
        'views/mail_templates.xml',
        'views/mail_template_views.xml',
        'views/ir_actions_views.xml',
        'views/ir_model_views.xml',
        'views/res_partner_views.xml',
        'views/mail_blacklist_views.xml',
    ],
    'demo': [
        'data/mail_channel_demo.xml',
    ],
    'installable': True,
    'application': True,
    'qweb': [
        'static/src/xml/activity.xml',
        'static/src/xml/activity_view.xml',
        'static/src/xml/composer.xml',
        'static/src/xml/discuss.xml',
        'static/src/xml/followers.xml',
        'static/src/xml/systray.xml',
        'static/src/xml/thread.xml',
        'static/src/xml/abstract_thread_window.xml',
        'static/src/xml/thread_window.xml',
        'static/src/xml/web_kanban_activity.xml',
        'static/src/xml/text_emojis.xml',

        'static/src/messaging/component/activity/activity.xml',
        'static/src/messaging/component/activity_box/activity_box.xml',
        'static/src/messaging/component/activity_mark_done_popover/activity_mark_done_popover.xml',
        'static/src/messaging/component/attachment/attachment.xml',
        'static/src/messaging/component/attachment_box/attachment_box.xml',
        'static/src/messaging/component/attachment_list/attachment_list.xml',
        'static/src/messaging/component/attachment_viewer/attachment_viewer.xml',
        'static/src/messaging/component/autocomplete_input/autocomplete_input.xml',
        'static/src/messaging/component/chat_window/chat_window.xml',
        'static/src/messaging/component/chat_window_header/chat_window_header.xml',
        'static/src/messaging/component/chat_window_hidden_menu/chat_window_hidden_menu.xml',
        'static/src/messaging/component/chat_window_manager/chat_window_manager.xml',
        'static/src/messaging/component/chatter/chatter.xml',
        'static/src/messaging/component/chatter_container/chatter_container.xml',
        'static/src/messaging/component/chatter_topbar/chatter_topbar.xml',
        'static/src/messaging/component/composer/composer.xml',
        'static/src/messaging/component/composer_text_input/composer_text_input.xml',
        'static/src/messaging/component/dialog/dialog.xml',
        'static/src/messaging/component/dialog_manager/dialog_manager.xml',
        'static/src/messaging/component/discuss/discuss.xml',
        'static/src/messaging/component/discuss_mobile_mailbox_selection/discuss_mobile_mailbox_selection.xml',
        'static/src/messaging/component/discuss_sidebar/discuss_sidebar.xml',
        'static/src/messaging/component/discuss_sidebar_item/discuss_sidebar_item.xml',
        'static/src/messaging/component/drop_zone/drop_zone.xml',
        'static/src/messaging/component/editable_text/editable_text.xml',
        'static/src/messaging/component/emojis_popover/emojis_popover.xml',
        'static/src/messaging/component/file_uploader/file_uploader.xml',
        'static/src/messaging/component/follow_button/follow_button.xml',
        'static/src/messaging/component/follower/follower.xml',
        'static/src/messaging/component/follower_list_menu/follower_list_menu.xml',
        'static/src/messaging/component/follower_subtype/follower_subtype.xml',
        'static/src/messaging/component/follower_subtype_list/follower_subtype_list.xml',
        'static/src/messaging/component/mail_template/mail_template.xml',
        'static/src/messaging/component/message/message.xml',
        'static/src/messaging/component/message_author_prefix/message_author_prefix.xml',
        'static/src/messaging/component/message_list/message_list.xml',
        'static/src/messaging/component/messaging_menu/messaging_menu.xml',
        'static/src/messaging/component/mobile_messaging_navbar/mobile_messaging_navbar.xml',
        'static/src/messaging/component/moderation_ban_dialog/moderation_ban_dialog.xml',
        'static/src/messaging/component/moderation_discard_dialog/moderation_discard_dialog.xml',
        'static/src/messaging/component/moderation_reject_dialog/moderation_reject_dialog.xml',
        'static/src/messaging/component/notification_list/notification_list.xml',
        'static/src/messaging/component/partner_im_status_icon/partner_im_status_icon.xml',
        'static/src/messaging/component/thread_icon/thread_icon.xml',
        'static/src/messaging/component/thread_preview/thread_preview.xml',
        'static/src/messaging/component/thread_viewer/thread_viewer.xml',
        'static/src/messaging/widget/common.xml',
        'static/src/messaging/widget/discuss/discuss.xml',
        'static/src/messaging/widget/discuss_invite_partner_dialog/discuss_invite_partner_dialog.xml',
        'static/src/messaging/widget/messaging_menu/messaging_menu.xml',
    ],
}
