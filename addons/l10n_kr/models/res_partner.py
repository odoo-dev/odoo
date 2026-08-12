# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from odoo import fields, models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

L10N_KR_ISSUANCE_TYPES = [
    ('tax_invoice', "Tax Invoice"),
    ('tax_exempt_invoice', "Tax-exempt Invoice"),
    ('card_payment', "Credit Card"),
    ('cash_receipt', "Cash Receipt"),
    ('other', "Other"),
]

# Prefix marking a value as Fernet ciphertext, so a plaintext (not-yet-migrated or malformed)
# value found in the JSON blob is never mistaken for one and passed as-is to Fernet.decrypt.
ENCRYPTED_PREFIX = 'fernet:'


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_kr_default_issuance_type = fields.Selection(
        selection=L10N_KR_ISSUANCE_TYPES,
        string="Proof of Issuance",
        help="Default proof of issuance to use when this partner is set on a sales order or invoice.",
    )

    def _get_all_additional_identifiers_metadata(self):
        # EXTENDS 'base' - register the South Korean Resident Registration Number (주민등록번호) as
        # a regular additional identifier, like DUNS, so it is viewed/edited through the standard
        # identifiers widget on the partner form instead of a bespoke field.
        return {
            **super()._get_all_additional_identifiers_metadata(),
            'KR_CN': {
                'sequence': 10,
                'label': _lt("Resident Registration Number"),
                'help': _lt("South Korean national Resident Registration Number (주민등록번호). Encrypted at rest."),
                'placeholder': '000000-0000000',
                'category': 'CN',
                'countries': ['KR'],
            },
        }

    def _l10n_kr_get_fernet(self):
        database_secret = self.env['ir.config_parameter'].sudo().get_str('database.secret')
        key = base64.urlsafe_b64encode(hashlib.sha256(database_secret.encode()).digest())
        return Fernet(key)

    def _clean_additional_identifiers(self, vals):
        # EXTENDS 'base' - by law, the Resident Registration Number must be encrypted at rest.
        # Validation/normalization in `super()` runs on the plaintext value; only the value that
        # ends up persisted to the database is encrypted.
        super()._clean_additional_identifiers(vals)
        identifiers = vals.get('additional_identifiers')
        if isinstance(identifiers, dict) and identifiers.get('KR_CN'):
            identifiers['KR_CN'] = ENCRYPTED_PREFIX + self._l10n_kr_get_fernet().encrypt(identifiers['KR_CN'].encode()).decode()

    def _l10n_kr_decrypt_rrn(self, identifiers):
        """Decrypt `identifiers['KR_CN']` in place, if present and encrypted."""
        encrypted_value = isinstance(identifiers, dict) and identifiers.get('KR_CN') or ''
        if encrypted_value.startswith(ENCRYPTED_PREFIX):
            try:
                identifiers['KR_CN'] = self._l10n_kr_get_fernet().decrypt(
                    encrypted_value.removeprefix(ENCRYPTED_PREFIX).encode()).decode()
            except InvalidToken:
                identifiers['KR_CN'] = ''

    def _read_format(self, fnames, load='_classic_read'):
        # EXTENDS 'base' - transparently decrypt the Resident Registration Number on the way out,
        # so it can be viewed and edited exactly like any other (non-encrypted) identifier. This
        # covers the identifiers widget on the partner form.
        result = super()._read_format(fnames, load=load)
        if 'additional_identifiers' in fnames:
            for vals in result:
                self._l10n_kr_decrypt_rrn(vals.get('additional_identifiers'))
        return result

    def _get_all_identifiers(self, enrich=False):
        # EXTENDS 'base' - decrypt for any programmatic consumer (PDF/EDI documents, preferred
        # identifier selection, ...), not just the form view.
        identifiers = super()._get_all_identifiers(enrich)
        self._l10n_kr_decrypt_rrn(identifiers)
        return identifiers
