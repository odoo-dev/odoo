# -*- coding: utf-8 -*-
"""
Common ZATCA EDI functionality shared between Account and POS modules.

This mixin provides base implementation for ZATCA-compliant UBL 2.1 XML generation
that can be used by both account.edi.xml.ubl_21.zatca and pos.edi.xml.ubl_21.zatca.
"""
import re
from hashlib import sha256
from base64 import b64encode
from lxml import etree

from odoo import models, fields
from odoo.tools.misc import file_path


# ZATCA Tax Classification Constants
TAX_EXEMPTION_CODES = ['VATEX-SA-29', 'VATEX-SA-29-7', 'VATEX-SA-30']
TAX_ZERO_RATE_CODES = ['VATEX-SA-32', 'VATEX-SA-33', 'VATEX-SA-34-1', 'VATEX-SA-34-2',
                       'VATEX-SA-34-3', 'VATEX-SA-34-4', 'VATEX-SA-34-5', 'VATEX-SA-35',
                       'VATEX-SA-36', 'VATEX-SA-EDU', 'VATEX-SA-HEA']

# ZATCA Payment Means Codes (UN/ECE 4461)
PAYMENT_MEANS_CODE = {
    'bank': 42,      # Payment to bank account
    'card': 48,      # Bank card
    'cash': 10,      # In cash
    'transfer': 30,  # Credit transfer
    'unknown': 1     # Instrument not defined
}


class ZatcaEdiCommonMixin(models.AbstractModel):
    """
    Common mixin for ZATCA EDI implementations.

    This provides shared functionality for generating ZATCA-compliant UBL 2.1 XML
    documents for both regular invoices (account.move) and POS orders (pos.order).
    """
    _name = 'zatca.edi.common.mixin'
    _description = 'ZATCA EDI Common Mixin'

    # -------------------------------------------------------------------------
    # Tax Category and Exemption
    # -------------------------------------------------------------------------

    def _get_tax_category_code(self, customer, supplier, tax):
        """
        Get ZATCA tax category code based on tax configuration.

        ZATCA Tax Categories:
        - S: Standard rated
        - E: Exempted (VATEX-SA-29, 29-7, 30)
        - Z: Zero rated with VAT (VATEX-SA-32 through 36, EDU, HEA)
        - O: Not subject to VAT

        :param customer: res.partner - Customer/buyer
        :param supplier: res.partner - Supplier/seller
        :param tax: account.tax - Tax record
        :return: str - Tax category code
        """
        if supplier.country_id.code != 'SA':
            # For non-SA suppliers, delegate to parent or return default
            if hasattr(super(), '_get_tax_category_code'):
                return super()._get_tax_category_code(customer, supplier, tax)
            return 'O'

        if tax and tax.amount != 0:
            return 'S'  # Standard rated
        elif tax and tax.l10n_sa_exemption_reason_code in TAX_EXEMPTION_CODES:
            return 'E'  # Exempted
        elif tax and tax.l10n_sa_exemption_reason_code in TAX_ZERO_RATE_CODES:
            return 'Z'  # Zero rated
        else:
            return 'O'  # Not subject to VAT

    def _get_tax_exemption_reason(self, customer, supplier, tax):
        """
        Get tax exemption reason code and description for ZATCA.

        :param customer: res.partner - Customer/buyer
        :param supplier: res.partner - Supplier/seller
        :param tax: account.tax - Tax record
        :return: dict - Contains tax_exemption_reason_code and tax_exemption_reason
        """
        if supplier.country_id.code != 'SA':
            # For non-SA suppliers, delegate to parent or return empty
            if hasattr(super(), '_get_tax_exemption_reason'):
                return super()._get_tax_exemption_reason(customer, supplier, tax)
            return {'tax_exemption_reason_code': None, 'tax_exemption_reason': None}

        if tax and tax.amount == 0:
            exemption_reason_by_code = dict(
                tax._fields["l10n_sa_exemption_reason_code"]._description_selection(self.env)
            )
            code = tax.l10n_sa_exemption_reason_code
            return {
                'tax_exemption_reason_code': code or "VATEX-SA-OOS",
                'tax_exemption_reason': (
                    exemption_reason_by_code[code].split(code)[1].lstrip()
                    if code else "Not subject to VAT"
                )
            }
        else:
            return {
                'tax_exemption_reason_code': None,
                'tax_exemption_reason': None,
            }

    # -------------------------------------------------------------------------
    # Partner and Address Helpers
    # -------------------------------------------------------------------------

    def _get_partner_party_identification_number(self, partner):
        """
        Get partner's party identification number for ZATCA compliance.

        For Saudi partners:
        - Uses l10n_sa_edi_additional_identification_number
        - For TIN scheme: extracts first 10 digits of VAT

        For non-Saudi partners:
        - Uses VAT number

        :param partner: res.partner - Partner record
        :return: str - Identification number
        """
        identification_number = partner.l10n_sa_edi_additional_identification_number
        vat = re.sub(r'[^a-zA-Z0-9]', '', partner.vat or "")

        if partner.country_code != "SA":
            identification_number = vat
        elif partner.l10n_sa_edi_additional_identification_scheme == 'TIN':
            # According to ZATCA, TIN is always first 10 digits of VAT
            identification_number = vat[:10]

        return identification_number

    def _get_address_node(self, vals):
        """
        Generate ZATCA-compliant address node for UBL.

        Includes ZATCA-specific fields:
        - BuildingNumber: Saudi-specific building number
        - PlotIdentification: Saudi-specific plot ID
        - CountrySubentityCode: State/region code

        :param vals: dict - Contains 'partner' (res.partner or res.bank)
        :return: dict - UBL address node structure
        """
        partner = vals['partner']
        country = partner['country' if partner._name == 'res.bank' else 'country_id']
        state = partner['state' if partner._name == 'res.bank' else 'state_id']

        # ZATCA-specific address fields (only for res.partner)
        building_number = partner.l10n_sa_edi_building_number if partner._name == 'res.partner' else ''
        plot_identification = partner.l10n_sa_edi_plot_identification if partner._name == 'res.partner' else ''

        return {
            'cbc:StreetName': {'_text': partner.street},
            'cbc:BuildingNumber': {'_text': building_number},
            'cbc:PlotIdentification': {'_text': plot_identification},
            'cbc:CitySubdivisionName': {'_text': partner.street2},
            'cbc:CityName': {'_text': partner.city},
            'cbc:PostalZone': {'_text': partner.zip},
            'cbc:CountrySubentity': {'_text': state.name},
            'cbc:CountrySubentityCode': {'_text': state.code},
            'cac:AddressLine': None,  # Not used in ZATCA
            'cac:Country': {
                'cbc:IdentificationCode': {'_text': country.code},
                'cbc:Name': {'_text': country.name},
            }
        }

    def _get_party_node(self, vals):
        """
        Generate ZATCA-compliant party node for UBL.

        Includes:
        - PartyIdentification with scheme ID (CRN, TIN, etc.)
        - PartyTaxScheme (not for foreign customers per BR-KSA-46)
        - PartyLegalEntity with CompanyID for SA entities
        - Contact information with formatted phone number

        :param vals: dict - Contains 'partner' and 'role' (customer/supplier)
        :return: dict - UBL party node structure
        """
        partner = vals['partner']
        role = vals['role']
        commercial_partner = partner.commercial_partner_id

        party_node = {}

        # Add party identification with scheme ID
        if identification_number := self._get_partner_party_identification_number(commercial_partner):
            party_node['cac:PartyIdentification'] = {
                'cbc:ID': {
                    '_text': identification_number,
                    'schemeID': commercial_partner.l10n_sa_edi_additional_identification_scheme,
                }
            }

        party_node.update({
            'cac:PartyName': {
                'cbc:Name': {'_text': partner.display_name}
            },
            'cac:PostalAddress': self._get_address_node(vals),
            # BR-KSA-46: PartyTaxScheme not required for foreign customers
            'cac:PartyTaxScheme': {
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {'_text': commercial_partner.vat},
                'cac:RegistrationAddress': self._get_address_node({'partner': commercial_partner}),
                'cac:TaxScheme': {
                    'cbc:ID': {'_text': 'VAT'}
                }
            } if role != 'customer' or partner.country_id.code == 'SA' else None,
            'cac:PartyLegalEntity': {
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                # CompanyID only for Saudi entities
                'cbc:CompanyID': {'_text': commercial_partner.vat} if commercial_partner.country_code == 'SA' else None,
                'cac:RegistrationAddress': self._get_address_node({'partner': commercial_partner}),
            },
            'cac:Contact': {
                'cbc:ID': {'_text': partner.id},
                'cbc:Name': {'_text': partner.name},
                'cbc:Telephone': {
                    '_text': re.sub(r"[^+\d]", '', partner.phone) if partner.phone else None
                },
                'cbc:ElectronicMail': {'_text': partner.email},
            }
        })

        return party_node

    # -------------------------------------------------------------------------
    # Payment Means
    # -------------------------------------------------------------------------

    def _l10n_sa_get_payment_means_code(self, record):
        """
        Get ZATCA payment means code.

        This is a template method that should be overridden in implementing classes
        to provide specific payment means logic for invoices vs POS orders.

        :param record: account.move or pos.order
        :return: str - Payment means code key (cash/card/bank/transfer/unknown)
        """
        # Default implementation - should be overridden
        return 'unknown'

    # -------------------------------------------------------------------------
    # Document Identification Helpers
    # -------------------------------------------------------------------------

    def _is_simplified_document(self, record):
        """
        Check if document should be treated as simplified (B2C).

        Template method to be implemented by specific modules.

        :param record: account.move or pos.order
        :return: bool - True if simplified invoice
        """
        # For invoices: check using invoice._l10n_sa_is_simplified()
        # For POS: always simplified
        if hasattr(record, '_l10n_sa_is_simplified'):
            return record._l10n_sa_is_simplified()
        # POS orders are always simplified
        return record._name == 'pos.order'

    def _get_invoice_type_code_name(self, record):
        """
        Get ZATCA invoice type code name.

        Format: 0TSNNNNN where:
        - T: Transaction type (1=Standard/B2B, 2=Simplified/B2C)
        - S: Simplified tax invoice indicator (always 0)
        - NNNNN: Transaction sub-types (all 0 for basic transactions)

        :param record: account.move or pos.order
        :return: str - Invoice type code name
        """
        is_simplified = self._is_simplified_document(record)
        is_export = False

        # Check if it's an export transaction (only for non-simplified)
        if not is_simplified and hasattr(record, 'commercial_partner_id'):
            is_export = (record.commercial_partner_id.country_id != record.company_id.country_id)

        return '0%s00%s00' % (
            '2' if is_simplified else '1',
            '1' if is_export else '0'
        )

    # -------------------------------------------------------------------------
    # XML Hash Generation
    # -------------------------------------------------------------------------

    def _l10n_sa_get_namespaces(self):
        """
        Get XML namespaces required for ZATCA UBL documents.

        :return: dict - Namespace prefix to URI mapping
        """
        return {
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
            'sig': 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
            'sac': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
            'sbc': 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
            'ds': 'http://www.w3.org/2000/09/xmldsig#',
            'xades': 'http://uri.etsi.org/01903/v1.3.2#'
        }

    def _l10n_sa_generate_invoice_xml_sha(self, xml_content):
        """
        Generate SHA256 hash of transformed and canonicalized invoice XML.

        Process:
        1. Parse XML content
        2. Transform using XSLT to remove signatures
        3. Canonicalize using c14n method
        4. Hash using SHA256

        :param xml_content: bytes or str - XML content
        :return: hashlib.sha256 object
        """
        def _canonicalize_xml(content):
            """Canonicalize XML using c14n method."""
            return etree.tostring(
                content,
                method="c14n",
                exclusive=False,
                with_comments=False,
                inclusive_ns_prefixes=self._l10n_sa_get_namespaces()
            )

        def _transform_and_canonicalize_xml(content):
            """Transform XML to remove signatures then canonicalize."""
            invoice_xsl = etree.parse(file_path('l10n_sa_edi/data/pre-hash_invoice.xsl'))
            transform = etree.XSLT(invoice_xsl)
            return _canonicalize_xml(transform(content))

        root = etree.fromstring(xml_content)
        transformed_xml = _transform_and_canonicalize_xml(root)
        return sha256(transformed_xml)

    def _l10n_sa_generate_invoice_xml_hash(self, xml_content, mode='hexdigest'):
        """
        Generate base64-encoded SHA256 hash of invoice XML.

        :param xml_content: bytes or str - XML content
        :param mode: str - 'hexdigest' or 'digest' for hash format
        :return: bytes - Base64-encoded hash
        """
        xml_sha = self._l10n_sa_generate_invoice_xml_sha(xml_content)

        if mode == 'hexdigest':
            xml_hash = xml_sha.hexdigest().encode()
        elif mode == 'digest':
            xml_hash = xml_sha.digest()
        else:
            raise ValueError(f"Invalid mode: {mode}")

        return b64encode(xml_hash)

    # -------------------------------------------------------------------------
    # Common Header Elements
    # -------------------------------------------------------------------------

    def _get_zatca_additional_document_references(self, record):
        """
        Get ZATCA-specific additional document references.

        These are common to both standard and simplified invoices:
        - PIH: Previous Invoice Hash
        - ICV: Invoice Counter Value

        Simplified invoices additionally have:
        - QR: QR code placeholder

        :param record: account.move or pos.order
        :return: list - Additional document reference nodes
        """
        references = []
        is_simplified = self._is_simplified_document(record)

        # QR code for simplified invoices (B2C)
        if is_simplified:
            references.append({
                'cbc:ID': {'_text': 'QR'},
                'cac:Attachment': {
                    'cbc:EmbeddedDocumentBinaryObject': {
                        '_text': 'N/A',  # Placeholder, replaced after signing
                        'mimeCode': 'text/plain',
                    }
                }
            })

        # PIH: Previous Invoice Hash
        # Determine the journal to check for latest hash
        journal = None
        if hasattr(record, 'journal_id'):
            journal = record.journal_id
        elif hasattr(record, 'session_id') and hasattr(record.session_id, 'config_id'):
            journal = record.session_id.config_id.journal_id

        previous_hash = (
            "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=="
            if record.company_id.l10n_sa_api_mode == 'sandbox' or not journal or not journal.l10n_sa_latest_submission_hash
            else journal.l10n_sa_latest_submission_hash
        )

        references.append({
            'cbc:ID': {'_text': 'PIH'},
            'cac:Attachment': {
                'cbc:EmbeddedDocumentBinaryObject': {
                    '_text': previous_hash,
                    'mimeCode': 'text/plain',
                }
            }
        })

        # ICV: Invoice Counter Value
        references.append({
            'cbc:ID': {'_text': 'ICV'},
            'cbc:UUID': {'_text': record.l10n_sa_chain_index},
        })

        return references

    def _get_zatca_signature_node(self, record):
        """
        Get ZATCA signature node for simplified invoices.

        Only required for simplified (B2C) invoices.

        :param record: account.move or pos.order
        :return: dict or None - Signature node if simplified, None otherwise
        """
        if self._is_simplified_document(record):
            return {
                'cbc:ID': {'_text': "urn:oasis:names:specification:ubl:signature:Invoice"},
                'cbc:SignatureMethod': {'_text': "urn:oasis:names:specification:ubl:dsig:enveloped:xades"},
            }
        return None

    # -------------------------------------------------------------------------
    # Common Filename Generation
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, record):
        """
        Generate ZATCA-compliant filename for invoice XML.

        Format: SellerVAT_DateTime_InvoiceNumber.xml

        :param record: account.move or pos.order
        :return: str - Filename
        """
        vat = record.company_id.partner_id.commercial_partner_id.vat or 'NOVAT'

        # Get the confirmation datetime
        if hasattr(record, 'l10n_sa_confirmation_datetime'):
            confirmation_dt = record.l10n_sa_confirmation_datetime
        else:
            confirmation_dt = fields.Datetime.now()

        # Convert to Riyadh timezone
        issue_date = fields.Datetime.context_timestamp(
            self.with_context(tz='Asia/Riyadh'),
            confirmation_dt
        )

        # Get record name/number
        if hasattr(record, 'name'):
            record_number = re.sub(r'[^a-zA-Z0-9 -]+', '-', record.name)
        else:
            record_number = str(record.id)

        file_name = f"{vat}_{issue_date.strftime('%Y%m%dT%H%M%S')}_{record_number}"

        # Check for file format in context
        file_format = self.env.context.get('l10n_sa_file_format', 'xml')
        if file_format:
            file_name = f'{file_name}.{file_format}'

        return file_name