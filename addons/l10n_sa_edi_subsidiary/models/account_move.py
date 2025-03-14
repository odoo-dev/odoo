from odoo import _, models, api
from odoo.tools import float_repr
from datetime import datetime
from base64 import b64decode
from lxml import etree
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.hazmat.backends import default_backend
from cryptography.x509 import load_der_x509_certificate


class AccountMove(models.Model):
    _inherit = "account.move"

    @api.model
    def _l10n_sa_decode_qr_code(self, qr_code_str):
        """
        Decodes the QR code into its tagged components.
        """
        decoded_values = []
        index = 0

        while index < len(qr_code_str):
            tag = qr_code_str[index]  # Read the tag
            length = qr_code_str[index + 1]  # Read the length of the field
            value = qr_code_str[index + 2 : index + 2 + length]  # Extract value
            decoded_values.append((tag, value))  # Store as (tag, value)
            index += 2 + length  # Move to the next field

        # Convert back to the same format used in encoding
        reconstructed_fields = [self._l10n_sa_get_qr_code_encoding(tag, value) for tag, value in decoded_values]
        
        return reconstructed_fields

    @api.model
    def _l10n_sa_get_qr_code(self, journal_id, unsigned_xml, certificate, signature, is_b2c=False):
        qr_code_str = super()._l10n_sa_get_qr_code(journal_id, unsigned_xml, certificate, signature, is_b2c)

        # if journal_id.partner_id == journal_id.company_id.partner_id and not journal_id.partner_id.l10n_sa_vat_group_id:
        #     return qr_code_str

        # Decode the QR code
        decoded_fields = self._l10n_sa_decode_qr_code(qr_code_str)

        # Modify seller name to use the journal's branch name
        if journal_id.partner_id != journal_id.company_id.partner_id:
            decoded_fields[0] = self._l10n_sa_get_qr_code_encoding(1, journal_id.partner_id.name.encode())  # Tag 1 (Seller Name)
        
        # Modify the seller vat to use the vat group
        if journal_id.partner_id.l10n_sa_vat_group_id:
            decoded_fields[1] = self._l10n_sa_get_qr_code_encoding(2, journal_id.partner_id.l10n_sa_vat_group_id.vat.encode())  # Tag 2 (VAT Number)

        # Reconstruct the modified QR code
        modified_qr_code = b''.join(decoded_fields)

        return modified_qr_code
