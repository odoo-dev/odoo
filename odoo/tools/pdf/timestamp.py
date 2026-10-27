# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime
import io

from asn1crypto import cms
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import ExtendedKeyUsageOID
from OpenSSL import crypto

from odoo.tools.pdf import PdfFileReader, PdfReadError
from odoo.tools.pdf.signature import PdfSigner, PreparedSignature, verify_signed_attributes

_HASHES = {
    'sha256': hashes.SHA256,
    'sha384': hashes.SHA384,
    'sha512': hashes.SHA512,
}


def _hash(data, algorithm):
    if algorithm not in _HASHES:
        raise ValueError('Unsupported timestamp digest algorithm')
    digest = hashes.Hash(_HASHES[algorithm]())
    digest.update(data)
    return digest.finalize()


def load_timestamp_trust(roots_pem, crls_pem, *, at_time=None, allow_historical=False):
    """Load explicit trust anchors and offline CRLs; never follow token-supplied URLs."""
    roots = x509.load_pem_x509_certificates(roots_pem)
    marker = b'-----END X509 CRL-----'
    crls = [
        x509.load_pem_x509_crl(block.strip() + marker)
        for block in crls_pem.split(marker)
        if block.strip()
    ]
    if not roots or not crls:
        raise ValueError('Configure timestamp trust anchors and current revocation lists')
    now = at_time or datetime.datetime.now(datetime.timezone.utc)
    crls = list({crl.fingerprint(hashes.SHA256()): crl for crl in crls}.values())
    if at_time:
        crls = [crl for crl in crls if crl.next_update_utc and crl.last_update_utc <= at_time <= crl.next_update_utc]
        if not crls:
            raise ValueError('No retained revocation list covers the timestamp issuance time')
    for crl in crls:
        if not allow_historical and (not crl.next_update_utc or crl.next_update_utc <= now
                or crl.last_update_utc > now + datetime.timedelta(minutes=5)):
            raise ValueError('Timestamp revocation material is stale or not yet valid')
    for root in roots:
        try:
            is_ca = root.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
        except x509.ExtensionNotFound as error:
            raise ValueError('A timestamp trust anchor must declare CA constraints') from error
        if not is_ca:
            raise ValueError('A timestamp trust anchor must be a CA certificate')
    return roots, crls


def verify_timestamp_token(token_der, digest, nonce, policy_oid, roots, crls, *, not_before=None):
    """Validate an RFC 5816 token, signer binding, signature, chain and offline CRLs.

    Callers supply approved anchors and CRLs covering the signed issuance time.
    Network retrieval and long-term archival renewal are intentionally absent.
    """
    try:
        token = cms.ContentInfo.load(token_der, strict=True)
        if token['content_type'].native != 'signed_data':
            raise ValueError('Expected a signed timestamp token')
        signed_data = token['content']
        if len(signed_data['signer_infos']) != 1:
            raise ValueError('Expected one timestamp signer')
        encapsulated = signed_data['encap_content_info']
        if encapsulated['content_type'].native != 'tst_info':
            raise ValueError('Expected timestamp information')
        info = encapsulated['content'].parsed
        imprint = info['message_imprint']
        if (info['version'].native != 'v1' or imprint['hash_algorithm']['algorithm'].native != 'sha256'
                or imprint['hashed_message'].native != digest or info['nonce'].native != nonce
                or info['policy'].native != policy_oid):
            raise ValueError('The timestamp does not match the requested digest, nonce or policy')
        generated = info['gen_time'].native
        now = datetime.datetime.now(datetime.timezone.utc)
        tolerance = datetime.timedelta(minutes=5)
        if generated > now + tolerance or (not_before and generated < not_before - tolerance):
            raise ValueError('The timestamp time is outside the issuance interval')

        signer = signed_data['signer_infos'][0]
        certificates = [item.chosen for item in signed_data['certificates'] if item.name == 'certificate']
        sid = signer['sid']
        if sid.name != 'issuer_and_serial_number':
            raise ValueError('Unsupported timestamp signer identifier')
        candidates = [
            certificate for certificate in certificates
            if certificate.serial_number == sid.chosen['serial_number'].native
            and certificate.issuer == sid.chosen['issuer']
        ]
        if len(candidates) != 1:
            raise ValueError('The timestamp signer certificate is missing or ambiguous')
        certificate = candidates[0]
        signer_cert = x509.load_der_x509_certificate(certificate.dump())
        if signer_cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
            raise ValueError('A timestamp signer must be an end-entity certificate')
        eku = signer_cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage)
        if not eku.critical or list(eku.value) != [ExtendedKeyUsageOID.TIME_STAMPING]:
            raise ValueError('The signer is not exclusively authorized for timestamping')

        attrs = signer['signed_attrs']
        attributes = {}
        for attribute in attrs:
            name = attribute['type'].native
            if name in attributes or len(attribute['values']) != 1:
                raise ValueError('Ambiguous timestamp signed attributes')
            attributes[name] = attribute['values'][0]
        algorithm = signer['digest_algorithm']['algorithm'].native
        if (attributes['content_type'].native != 'tst_info'
                or attributes['message_digest'].native != _hash(encapsulated['content'].contents, algorithm)):
            raise ValueError('The signed timestamp content digest does not match')
        cert_id = attributes['signing_certificate_v2']['certs'][0]
        if cert_id['cert_hash'].native != _hash(certificate.dump(), cert_id['hash_algorithm']['algorithm'].native):
            raise ValueError('The ESSCertIDv2 does not identify the signer certificate')
        issuer_serial = cert_id['issuer_serial']
        if issuer_serial.native is not None and (
            issuer_serial['serial_number'].native != certificate.serial_number
            or not any(name.name == 'directory_name' and name.chosen == certificate.issuer for name in issuer_serial['issuer'])
        ):
            raise ValueError('The ESSCertIDv2 issuer does not match the signer')
        signature_algorithm = signer['signature_algorithm']['algorithm'].native
        public_algorithm = certificate.public_key.algorithm
        allowed = (
            ('rsassa_pkcs1v15', algorithm + '_rsa') if public_algorithm == 'rsa'
            else (algorithm + '_ecdsa',) if public_algorithm == 'ec' else ()
        )
        if signature_algorithm not in allowed:
            raise ValueError('Unsupported timestamp signature algorithm')
        if not verify_signed_attributes(attrs.untag(), signer['signature'].native, certificate, algorithm):
            raise ValueError('The timestamp signature is invalid')

        store = crypto.X509Store()
        for root in roots:
            store.add_cert(crypto.X509.from_cryptography(root))
        for crl in crls:
            # A retained bundle can contain a later renewal. Validate only CRLs
            # whose signed validity interval covers this timestamp's issuance.
            if crl.next_update_utc and crl.last_update_utc <= generated <= crl.next_update_utc:
                store.add_crl(crl)
        store.set_flags(crypto.X509StoreFlags.CRL_CHECK | crypto.X509StoreFlags.CRL_CHECK_ALL)
        store.set_time(generated)
        chain = [crypto.load_certificate(crypto.FILETYPE_ASN1, item.dump()) for item in certificates if item != certificate]
        crypto.X509StoreContext(store, crypto.X509.from_cryptography(signer_cert), chain).verify_certificate()
        return {'generated_at': generated, 'policy_oid': info['policy'].native}
    except (KeyError, TypeError, IndexError, x509.ExtensionNotFound, crypto.X509StoreContextError) as error:
        raise ValueError('Timestamp signature, certificate or revocation validation failed') from error


def _timestamp_revision(pdf_data):
    try:
        return _read_timestamp_revision(pdf_data)
    except (PdfReadError, KeyError, TypeError, AttributeError, UnicodeError) as error:
        raise ValueError('Unreadable document timestamp revision') from error


def _read_timestamp_revision(pdf_data):
    reader = PdfFileReader(io.BytesIO(pdf_data), strict=True)
    fields = reader.get_fields() or {}
    for field in reversed(list(fields.values())):
        value = field.get('/V')
        if not value:
            continue
        signature = value.get_object()
        if signature.get('/Type') != '/DocTimeStamp' or signature.get('/SubFilter') != '/ETSI.RFC3161':
            continue
        ranges = list(signature['/ByteRange'])
        if (len(ranges) != 4 or any(not isinstance(value, int) for value in ranges)
                or ranges[0] != 0 or not 0 < ranges[1] < ranges[2] <= len(pdf_data)
                or ranges[3] < 0 or ranges[2] + ranges[3] != len(pdf_data)
                or pdf_data[ranges[1]:ranges[1] + 1] != b'<' or pdf_data[ranges[2] - 1:ranges[2]] != b'>'):
            raise ValueError('The document timestamp must cover the entire final PDF revision')
        digest = _hash(pdf_data[:ranges[1]] + pdf_data[ranges[2]:], 'sha256')
        contents = bytes.fromhex(pdf_data[ranges[1] + 1:ranges[2] - 1].decode('ascii'))
        if contents != bytes(signature['/Contents']):
            raise ValueError('The PDF timestamp contents do not match its byte range')
        return PreparedSignature(bytearray(pdf_data), digest, ranges[1] + 1, ranges[2] - 1), contents
    raise ValueError('No document timestamp was found')


def verify_document_timestamp(pdf_data, digest, nonce, policy_oid, roots, crls, *, not_before=None):
    prepared, contents = _timestamp_revision(pdf_data)
    if prepared.digest != digest:
        raise ValueError('The timestamped PDF does not match its prepared revision')
    token = cms.ContentInfo.load(contents).dump()
    if any(contents[len(token):]):
        raise ValueError('Unexpected bytes after the PDF timestamp token')
    return verify_timestamp_token(token, digest, nonce, policy_oid, roots, crls, not_before=not_before)


def complete_document_timestamp(pdf_data, token_der, digest, nonce, policy_oid, roots, crls, *, not_before=None):
    prepared, contents = _timestamp_revision(pdf_data)
    if prepared.digest != digest or any(contents):
        raise ValueError('The reserved PDF timestamp revision has changed')
    verify_timestamp_token(token_der, digest, nonce, policy_oid, roots, crls, not_before=not_before)
    final_pdf = PdfSigner.fill_signature_placeholder(prepared, token_der)
    metadata = verify_document_timestamp(final_pdf, digest, nonce, policy_oid, roots, crls, not_before=not_before)
    return final_pdf, metadata
