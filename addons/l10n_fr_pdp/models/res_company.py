from urllib.parse import urljoin
import re

from odoo import api, fields, models

PDP_identifier_re = re.compile(r'([0-9]{9})(_[0-9]{14})?(_.+)?$')


class ResCompany(models.Model):
    _inherit = 'res.company'

    pdp_identifier = fields.Char(compute='_compute_pdp_identifier', inverse='_inverse_pdp_identifier')

    @api.depends('peppol_eas', 'peppol_endpoint')
    def _compute_pdp_identifier(self):
        for record in self:
            partner = record.partner_id
            record.pdp_identifier = partner.peppol_endpoint if partner.peppol_eas == '0225' else False

    def _inverse_pdp_identifier(self):
        for record in self:
            match = PDP_identifier_re.match(record.pdp_identifier or '')
            siren = match and match.group(1)
            if not siren:
                continue
            siret = match.group(2)[1:] if match and match.group(2) else False  # Remove `_` at the start
            record.partner_id.write({
                'peppol_eas': '0225',
                'peppol_endpoint': record.pdp_identifier,  # Will be verified by `_check_peppol_fields` constraint
                'siret': siret or siren,
            })

    @api.model
    def _check_pdp_identifier(self, pdp_identifier, warning=False):
        return pdp_identifier and PDP_identifier_re.match(pdp_identifier)

    def _get_pdp_webhook_endpoint(self):
        self.ensure_one()
        return urljoin(self.get_base_url(), '/pdp/webhook')

    def _peppol_supported_document_types(self):
        """Returns a flattened dictionary of all supported document types."""
        return {
            **super()._peppol_supported_document_types(),
            'urn:un:unece:uncefact:data:standard:CrossDomainAcknowledgementAndResponse:100::CrossDomainAcknowledgementAndResponse##urn:peppol:france:billing:cdv:1.0::D22B': "French CDAR (Lifecycle Messages)",
            'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017::2.1': "UBL V2.1 Invoice",
            'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017::2.1': "UBL V2.1 CreditNote",
            'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100::CrossIndustryInvoice##urn:cen.eu:en16931:2017::D16B': "CII",
            'urn:peppol:doctype:pdf+xml##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:Factur-X:1.0::D22B': "French Factur-X",
            'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0::2.1': "UBL EN16931 French CIUS Invoice",
            'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0::2.1': "UBL EN16931 French CIUS CreditNote",
            'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:extended:1.0::2.1': "UBL EN16931 French CTC Extended Invoice",
            'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:extended:1.0::2.1': "UBL EN16931 French CTC Extended CreditNote",
            'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100::CrossIndustryInvoice##urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0::D22B': "UN/CEFACT EN16931 French CIUS",
            'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100::CrossIndustryInvoice##urn:cen.eu:en16931:2017#conformant#urn:peppol:france:billing:extended:1.0::D22B': "UN/CEFACT EN16931 French CTC Extended",
        }
