from odoo import models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    # -------------------------------------------------------------------------
    # SENDING METHODS
    # -------------------------------------------------------------------------

    def _get_default_invoice_edi_format(self, move, **kwargs) -> str:
        # EXTENDS 'account'
        if (
            'peppol' in kwargs.get('sending_methods', [])
            and move.partner_id._get_pdp_receiver_identification_info()[0] == 'pdp'
        ):
            return 'ubl_21_fr'
        return super()._get_default_invoice_edi_format(move, **kwargs)

    def _is_applicable_to_company(self, method, company):
        # EXTENDS 'account'
        if method == 'peppol' and company.country_code == 'FR':
            return company.account_peppol_proxy_state == 'receiver'
        return super()._is_applicable_to_company(method, company)

    # TODO: maybe it would be better to have a dedicate route for other flows?
    def _get_peppol_document_params(self, edi_user, partner, invoice, invoice_data):
        result = super()._get_peppol_document_params(edi_user, partner, invoice, invoice_data)
        if edi_user.proxy_type == 'pdp':
            result['flow_number'] = 2
        return result
