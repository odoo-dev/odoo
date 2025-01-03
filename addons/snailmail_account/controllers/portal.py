from odoo import _
from odoo.addons.portal.controllers.portal import CustomerPortal


class PortalAccount(CustomerPortal):

    def _prepare_address_form_values(self, *args, **kwargs):
        # EXTENDS 'portal'
        address_form_values = super(). _prepare_address_form_values(*args, **kwargs)
        address_form_values['invoice_sending_methods'].update({'snailmail': _('by Post')})
        return address_form_values
