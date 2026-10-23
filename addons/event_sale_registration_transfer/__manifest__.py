{
    'name': 'Event Ticket Transfer with Sale',
    'version': '1.0',
    'category': 'Marketing/Events',
    'summary': 'Bridge between Event Ticket Transfer and Event Sales',
    'description': """
Keep transferred tickets safe in the sale flow:

* warn before cancelling an order whose tickets were transferred, as
  cancelling it cancels the tickets of their new owners;
* do not reassign transferred tickets when the order customer changes;
* do not show the other tickets of the order to the new owner of a ticket;
* hide transferred tickets from the portal of the buyer.
""",
    'depends': ['event_registration_transfer', 'event_sale'],
    'data': [
        'security/ir.access.csv',
        'wizard/sale_order_transfer_cancel_views.xml',
    ],
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
