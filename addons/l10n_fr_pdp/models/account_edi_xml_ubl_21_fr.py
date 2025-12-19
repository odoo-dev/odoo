from odoo import _, models

from odoo.addons.account_edi_ubl_cii.models.account_edi_xml_ubl_20 import UBL_NAMESPACES

# PDP_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:peppol:france:billing:cius:1.0'  # Not accepted by SuperPDP due to missing validator
PDP_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017'

# Default French notes content [BR-FR-05]
FR_DEFAULT_NOTES = {
    'PMT': "En cas de retard de paiement, une indemnité forfaitaire de 40€ pour frais de recouvrement sera exigée (art. L.441-10 et D.441-5 du Code de commerce).",
    'PMD': "Pénalités de retard au taux annuel de 10% en cas de paiement après la date d'échéance.",
    'AAB': "Pas d'escompte pour paiement anticipé.",
}


class AccountEdiXmlUbl21Fr(models.AbstractModel):
    _name = "account.edi.xml.ubl_21_fr"
    _inherit = 'account.edi.xml.ubl_bis3'
    _description = "France UBL 2.1 E-Invoicing Format"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_ubl_21_fr.xml"

    def _export_invoice(self, invoice, convert_fixed_taxes=True):
        # Use new helpers
        return self._export_invoice_new(invoice)

    def _export_invoice_constraints_new(self, invoice, vals):
        # EXTENDS account.edi.xml.ubl_21
        constraints = super()._export_invoice_constraints_new(invoice, vals)

        for partner_type in ('supplier', 'customer'):
            partner = vals[partner_type]
            if not partner.pdp_identifier:
                constraints[f"ubl_21_fr_{partner_type}_pdp_identifier_required"] = _("The following partner's PDP identifier is missing: %s", partner.display_name)
            if not partner.siret:
                constraints[f"ubl_21_fr_{partner_type}_siret_required"] = _("The following partner's SIRET is missing: %s", partner.display_name)

        return constraints

    def _import_retrieve_partner_vals(self, tree, role):
        # EXTENDS account.edi.xml.ubl_20
        partner_vals = super()._import_retrieve_partner_vals(tree, role)
        endpoint_node = tree.find(f'.//cac:{role}Party/cac:Party/cbc:EndpointID', UBL_NAMESPACES)
        if endpoint_node is not None:
            peppol_eas = endpoint_node.attrib.get('schemeID')
            peppol_endpoint = endpoint_node.text
            if peppol_eas and peppol_endpoint:
                # include the EAS and endpoint in the search domain when retrieving the partner
                partner_vals.update({
                    'peppol_eas': peppol_eas,
                    'peppol_endpoint': peppol_endpoint,
                })
            # Note: we can not import `pdp_identifier` because the partner vals are passed to `_import_partner` which
            #       only has a fixed set of kwargs.
            #       We set the value in `_import_fill_invoice`
        return partner_vals

    def _import_fill_invoice(self, invoice, tree, qty_factor):
        logs = super()._import_fill_invoice(invoice, tree, qty_factor)

        partner = invoice.partner_id
        if partner.peppol_eas == '0225':
            partner.pdp_identifier = partner.peppol_endpoint

        return logs

    def _add_invoice_header_nodes(self, document_node, vals):
        # EXTENDS account.edi.xml.ubl_21
        super()._add_invoice_header_nodes(document_node, vals)
        profile_id = {
            'invoice': 'B1',
            'credit_note': 'S1',
        }.get(vals['document_type'])
        document_node.update({
            'cbc:CustomizationID': {'_text': PDP_CUSTOMIZATION_ID},
            'cbc:ProfileID': {'_text': profile_id},
        })

        # TODO: adapted from BAJE PR
        # [BR-FR-05] Add mandatory notes with defaults if not already present
        # Initialize / Listify 'cbc:Note'
        existing_note = document_node.get('cbc:Note')
        if not existing_note or not isinstance(document_node.get('cbc:Note'), list):
            document_node['cbc:Note'] = [existing_note] if existing_note else []
        # Add default notes
        for code, default_content in FR_DEFAULT_NOTES.items():
            document_node['cbc:Note'].append({
                '_text': f"#{code}#{default_content}",
            })

        # TODO:after_certification: Remove
        if self.env['ir.config_parameter'].sudo().get_param('l10n_fr_pdp.superpdp_refuse', 'no') == 'yes':
            document_node['cbc:Note'].append({
                '_text': "#SAF#SUPER_PDP_ADR_ERROR",
            })

    def _add_invoice_payment_means_nodes(self, document_node, vals):
        super()._add_invoice_payment_means_nodes(document_node, vals)
        # [UBL-CR-412]-A UBL invoice should not include the PaymentMeans PaymentDueDate
        document_node['cac:PaymentMeans']['cbc:PaymentDueDate'] = None
        # [UBL-CR-414]-A UBL invoice should not include the PaymentMeans InstructionID
        document_node['cac:PaymentMeans']['cbc:InstructionID'] = None

    def _ubl_get_partner_address_node(self, vals, partner):
        # schematron/openpeppol/3.13.0/xslt/CEN-EN16931-UBL.xslt
        # [UBL-CR-225]-A UBL invoice should not include the AccountingCustomerParty Party PostalAddress CountrySubentityCode
        node = super()._ubl_get_partner_address_node(vals, partner)
        node['cbc:CountrySubentityCode'] = None
        node['cac:Country']['cbc:Name'] = None
        return node

    def _ubl_add_party_endpoint_id_node(self, vals):
        super()._ubl_add_party_endpoint_id_node(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id
        vals['party_node']['cbc:EndpointID'] = {
            '_text': commercial_partner.pdp_identifier,
            'schemeID': '0225',
        }

    def _ubl_add_party_identification_nodes(self, vals):
        super()._ubl_add_party_identification_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        siret = commercial_partner.siret or ''
        siren = siret[:9]
        party_id = siren
        party_id_scheme = "0002"
        # party_id = siret
        # party_id_scheme = "0009"
        # TODO: siret if siret?
        # [UBL-SR-16] Buyer identifier shall occur maximum once
        vals['party_node']['cac:PartyIdentification'] = {
            'cbc:ID': {'_text': party_id, 'schemeID': party_id_scheme},
        }

    def _ubl_add_party_tax_scheme_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_tax_scheme_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        vals['party_node']['cac:PartyTaxScheme'] = [
            {
                'cbc:CompanyID': {'_text': commercial_partner.vat or commercial_partner.pdp_identifier},
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT' if commercial_partner.vat else "0225"},
                },
            },
        ]

    def _ubl_add_party_legal_entity_nodes(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_party_legal_entity_nodes(vals)
        partner = vals['party_vals']['partner']
        commercial_partner = partner.commercial_partner_id

        siret = commercial_partner.siret or ''
        siren = siret[:9]
        vals['party_node']['cac:PartyLegalEntity'] = {
            'cbc:RegistrationName': {'_text': commercial_partner.name},
            'cbc:CompanyID': {
                '_text': siren, 'schemeID': '0002',
            },
        }
