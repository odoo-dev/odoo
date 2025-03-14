import base64

from cryptography import x509
from cryptography.x509 import ObjectIdentifier
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization

from odoo import api, models, service

CERT_TEMPLATE_NAME = {
    'prod': b'\x0c\x12ZATCA-Code-Signing',
    'sandbox': b'\x13\x15PREZATCA-Code-Signing',
    'preprod': b'\x13\x15PREZATCA-Code-Signing',
}


class Certificate(models.Model):
    _inherit = 'certificate.certificate'

    def _l10n_sa_get_issuer_name(self):
        self.ensure_one()
        cert = x509.load_pem_x509_certificate(base64.b64decode(self.pem_certificate))
        return ', '.join([s.rfc4514_string() for s in cert.issuer.rdns[::-1]])

    @api.model
    def _l10n_sa_get_csr_vals(self, journal, partner=False):
        partner = partner or journal.company_id.partner_id
        company_id = journal.company_id
        version_info = service.common.exp_version()
        return {
            "subject_names": {
                # Country Name
                NameOID.COUNTRY_NAME: partner.country_id.code,
                # Organization Unit Name
                NameOID.ORGANIZATIONAL_UNIT_NAME: partner.name,
                # Organization Name
                NameOID.ORGANIZATION_NAME: partner.name,
                # Subject Common Name
                NameOID.COMMON_NAME: '%s|%s|%s' % (journal.code, journal.name, partner.name),
                # Organization Identifier
                ObjectIdentifier('2.5.4.97'): partner.vat,
                # State/Province Name
                NameOID.STATE_OR_PROVINCE_NAME: partner.state_id.name,
                # Locality Name
                NameOID.LOCALITY_NAME: partner.city,
            },
            "extensions": {
                # EGS Serial Number. Manufacturer or Solution Provider Name, Model or Version and Serial Number.
                # To be written in the following format: "1-... |2-... |3-..."
                ObjectIdentifier('2.5.4.4'): '1-Odoo|2-%s|3-%s' % (
                    version_info['server_version_info'][0], journal.l10n_sa_serial_number),
                # Organisation Identifier (UID)
                NameOID.USER_ID: partner.vat,
                # Invoice Type. 4-digit numerical input using 0 & 1
                NameOID.TITLE: company_id._l10n_sa_get_csr_invoice_type(),
                # Location
                ObjectIdentifier('2.5.4.26'): partner.street,
                # Industry
                ObjectIdentifier('2.5.4.15'): partner.industry_id.name or 'Other',
            }
        }

    @api.model
    def _l10n_sa_get_csr_str(self, journal):
        """
            Return a string representation of a ZATCA compliant CSR that will be sent to the Compliance API in order to get back
            a signed X509 certificate
        """
        if not journal:
            return

        company_id = journal.company_id
        builder = x509.CertificateSigningRequestBuilder()
        csr_vals = self._l10n_sa_get_csr_vals(journal)
        subject_names = csr_vals["subject_names"]
        extensions = csr_vals["extensions"]

        # The CertificateSigningRequestBuilder instances are immutable, which is why everytime we modify one,
        # we have to assign it back to itself to keep track of the changes
        builder = builder.subject_name(x509.Name([
            x509.NameAttribute(key, '%s' % val) for key, val in subject_names.items()
        ]))

        x509_alt_names_extension = x509.SubjectAlternativeName([
            x509.DirectoryName(
                x509.Name(
                    [x509.NameAttribute(key, val) for key, val in extensions.items()]
                )
            )
        ])
        x509_extensions = (
            # Add Certificate template name extension
            (x509.UnrecognizedExtension(ObjectIdentifier('1.3.6.1.4.1.311.20.2'),
                                        CERT_TEMPLATE_NAME[company_id.l10n_sa_api_mode]), False),
            # Add alternative names extension
            (x509_alt_names_extension, False),
        )

        for ext in x509_extensions:
            builder = builder.add_extension(ext[0], critical=ext[1])

        private_key = serialization.load_pem_private_key(base64.b64decode(company_id.l10n_sa_private_key_id.pem_key), password=None)
        request = builder.sign(private_key, hashes.SHA256())

        return base64.b64encode(request.public_bytes(serialization.Encoding.PEM)).decode()
