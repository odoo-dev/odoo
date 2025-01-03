from odoo import _
from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.addons.account.models.company import PEPPOL_LIST
from odoo.http import request


class PortalAccount(CustomerPortal):

    # ------------------------------------------------------------
    # My Account
    # ------------------------------------------------------------

    def _prepare_address_form_values(self, *args, **kwargs):
        # EXTENDS 'portal'
        address_form_values = super()._prepare_address_form_values(*args, **kwargs)
        can_send = request.env['account_edi_proxy_client.user']._get_can_send_domain()
        if request.env.company.account_peppol_proxy_state in can_send:
            partner = request.env.user.partner_id
            address_form_values['invoice_sending_methods'].update({'peppol': _('by Peppol')})
            address_form_values.update({
                'peppol_eas_list': dict(partner._fields['peppol_eas'].selection),
            })
        return address_form_values

    def _validate_address_values(self, address_values, *args, **kwargs):
        # EXTENDS 'portal'
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, *args, **kwargs
        )

        if address_values.get('invoice_sending_method') == 'peppol':
            peppol_eas = address_values.get('peppol_eas')
            peppol_endpoint = address_values.get('peppol_endpoint')
            edi_format = address_values.get('invoice_edi_format')
            if request.env['res.country'].browse(int(address_values.get('country_id'))).code not in PEPPOL_LIST:
                invalid_fields.add('country_id')
                address_values['country_id'] = 'error'
                error_messages.append(_('That country is not available for Peppol.'))
            if endpoint_error_message := request.env['res.partner']._build_error_peppol_endpoint(peppol_eas, peppol_endpoint):
                invalid_fields.add('invalid_peppol_endpoint')
                error_messages.append(endpoint_error_message)
            if request.env['res.partner']._get_peppol_verification_state(peppol_endpoint, peppol_eas, edi_format) != 'valid':
                invalid_fields.add('invalid_peppol_config')
                error_messages.append(_('If you want to be invoiced by Peppol, your configuration must be valid.'))

        return invalid_fields, missing_fields, error_messages
