from odoo import api, fields, models

INVOICE_RESPONSE_CUSTOMISATION_ID = "busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2::ApplicationResponse##urn:fdc:peppol.eu:poacc:trns:invoice_response:3::2.1"


class ResPartner(models.Model):
    _inherit = 'res.partner'

    peppol_supported_documents = fields.Json('Supported Peppol Documents')
    peppol_response_support = fields.Boolean('Peppol Response Service', compute='_compute_response_support')

    @api.depends('peppol_supported_documents', 'peppol_verification_state')
    def _compute_response_support(self):
        for partner in self:
            partner.peppol_response_support = (
                partner.peppol_verification_state == 'valid'
                and partner.peppol_supported_documents
                and INVOICE_RESPONSE_CUSTOMISATION_ID in partner.peppol_supported_documents
            )

    def _peppol_fill_participant_supported_documents(self):
        for partner in self:
            if partner.peppol_send_to_endpoint:
                participant_info = partner._peppol_lookup(partner.peppol_send_to_endpoint)
                if not participant_info:
                    continue
                partner.peppol_supported_documents = [service['document_id'] for service in participant_info.get('services', []) if service.get('document_id')]

    def button_peppol_sync(self, force=True):
        # EXTENDS account_peppol
        super().button_peppol_sync(force=force)
        if self.peppol_verification_state == 'valid':
            self._peppol_fill_participant_supported_documents()
