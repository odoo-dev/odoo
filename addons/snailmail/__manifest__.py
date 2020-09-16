# -*- coding: utf-8 -*-
{
    'name': "Snail Mail",
    'description': """
Allows users to send documents by post
=====================================================
        """,
    'category': 'Hidden/Tools',
    'version': '0.3',
    'depends': [
        'iap_mail',
        'mail'
    ],
    'data': [
        'data/snailmail_data.xml',
        'views/report_assets.xml',
        'views/snailmail_views.xml',
        'views/assets.xml',
        'wizard/snailmail_confirm_views.xml',
        'wizard/snailmail_letter_cancel_views.xml',
        'wizard/snailmail_letter_format_error_views.xml',
        'wizard/snailmail_letter_missing_required_fields_views.xml',
        'security/ir.model.access.csv',
    ],
    'qweb': [
        'static/src/bugfix/bugfix.xml',
        'static/src/components/Message/Message.xml',
        'static/src/components/NotificationGroup/NotificationGroup.xml',
        'static/src/components/SnailmailErrorDialog/SnailmailErrorDialog.xml',
        'static/src/components/SnailmailNotificationPopover/SnailmailNotificationPopover.xml',
    ],
    'auto_install': True,
}
