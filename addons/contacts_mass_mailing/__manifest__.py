# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Schedule Mass Mailing for Contacts",
    'summary': "Schedule mass mailings to be sent in the future",
    'description': """
Schedule and send mass emails to contacts at a future date and time..
""",
    'version': '1.0',
    'depends': ['mail', 'mass_mailing', 'contacts'],
    'data': [
        'wizard/mail_compose_message_views.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
