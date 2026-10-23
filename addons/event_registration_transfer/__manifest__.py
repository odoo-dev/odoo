{
    'name': 'Event Ticket Transfer',
    'version': '1.0',
    'category': 'Marketing/Events',
    'summary': 'Let attendees transfer their tickets to another contact',
    'description': """
Ticket Transfer
===============

Allow attendees to transfer their event registration to another contact,
identified by email or phone number. The recipient accepts the transfer
through a secured link; the registration is then reassigned and a new
barcode is generated, voiding the previous ticket.
""",
    'depends': ['event'],
    'data': [
        'security/ir.access.csv',
        'data/ir_sequence_data.xml',
        'data/ir_cron_data.xml',
        'data/mail_template_data.xml',
        'wizard/event_registration_transfer_wizard_views.xml',
        'views/event_registration_transfer_views.xml',
        'views/event_registration_views.xml',
        'views/event_event_views.xml',
        'views/event_type_views.xml',
        'views/event_portal_templates.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
