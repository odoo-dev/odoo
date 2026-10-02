# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""Aisino Yunshui (爱信诺云税) common-envelope crypto.

Pure Python, no Odoo dependency — importable and testable standalone.

Implements the Ch.1 (公共请求/返回参数) + Ch.6 (JAVA DEMO) envelope:

  outer request/response:
    interfaceCode, zipCode, encryptCode, access_token, datagram, signtype, signature
    (+ code, msg on the response)

  - SM4 key   = MD5hex(授权码 + 组织编码 + timestamp)[8:24]  -> 16 bytes
    (the doc PROSE says "16位MD5" but the authoritative Java demo is
     Md5Utils.hash(...).substring(8, 24) — the MIDDLE 16 hex chars, not the first 16)
  - access_token = base64(组织编码[6] + 税号 + timestamp[14])   (identifier, not encryption)
  - datagram  = SM4/ECB/PKCS5 of the JSON payload as lowercase HEX, then base64, layered by zipCode
    (the Java demo's sm4Encrypt is hutool encryptHex; the prose never says so)
  - signature = HMAC-SHA256(interfaceCode+zipCode+encryptCode+access_token+datagram+signtype,
                key=SM4 key) -> UPPERCASE hex
  - the SAME timestamp builds both the SM4 key and the access_token

zipCode layering (encrypt -> datagram):
  0: base64( hex(sm4(json)) )
  1: base64( gzip( hex(sm4(json)) ) )                  (hex placement assumed)
  2: base64( hex(sm4( base64( gzip(json) ) )) )        (hex placement assumed)
  Requests go out as zipCode 0, the only layering verified against the gateway; 1 and 2 are
  still decoded.
"""
import base64
import gzip
import hashlib
import hmac
import json
import logging
import zlib
from datetime import datetime

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from . import sm4_pure

# ``algorithms.SM4`` only exists when cryptography is built against an OpenSSL
# carrying SM4 (and not at all before cryptography 35), so fall back to our own.
HAS_NATIVE_SM4 = hasattr(algorithms, 'SM4')

SIGNTYPE = 'HMacSHA256'
ENCRYPT_CODE = '1'  # fixed: 1 = SM4
MAX_DATAGRAM_LENGTH = 20 * 1024 * 1024
MAX_DECOMPRESSED_BYTES = 20 * 1024 * 1024
SIGNED_FIELDS = ('interfaceCode', 'zipCode', 'encryptCode', 'access_token', 'datagram', 'signtype')


_logger = logging.getLogger(__name__)


class AisinoProtocolError(Exception):
    """The gateway's verdict: outer code != 1000."""

    def __init__(self, code, msg=''):
        super().__init__(f'Aisino protocol error {code}: {msg}')
        self.code = str(code)
        self.msg = msg


class MalformedEnvelope(Exception):
    """A response envelope that can't be read: missing fields, bad encoding, too large."""


class SignatureMismatch(Exception):
    """A response whose signature doesn't match the one computed locally."""


def now_timestamp():
    """YYYYMMDDHHMMSS (14 digits)."""
    return datetime.now().strftime('%Y%m%d%H%M%S')


def derive_sm4_key(identity_code, platform_code, timestamp):
    """SM4 key = the 16-char hex string MD5(授权码+组织编码+timestamp)[8:24], as 16 UTF-8 bytes.

    The Java demo is  SmUtil.sm4(key.getBytes())  where key = Md5Utils.hash(...).substring(8,24)
    — i.e. the 16 hex CHARACTERS used as a 16-byte key (each ASCII char = 1 byte), NOT
    hex-decoded (which would give only 8 bytes and fail SM4's 128-bit key requirement).
    """
    md5hex = hashlib.md5(
        (identity_code + platform_code + timestamp).encode('utf-8')
    ).hexdigest()
    return md5hex[8:24].encode('utf-8')


def make_access_token(platform_code, tax_no, timestamp):
    """access_token = base64(组织编码 + 税号 + timestamp)."""
    return base64.b64encode(
        (platform_code + tax_no + timestamp).encode('utf-8')
    ).decode('ascii')


def timestamp_from_access_token(access_token):
    """Recover the 14-digit timestamp from an access_token (last 14 chars of the b64 payload)."""
    plain = base64.b64decode(access_token).decode('utf-8')
    return plain[-14:]


def _pad_pkcs5(data):
    pad = 16 - (len(data) % 16)
    return data + bytes([pad]) * pad


def _unpad_pkcs5(data):
    if not data:
        raise ValueError('empty ciphertext')
    pad = data[-1]
    if pad < 1 or pad > 16 or data[-pad:] != bytes([pad]) * pad:
        raise ValueError('bad PKCS5 padding')
    return data[:-pad]


def sm4_encrypt(plaintext, key):
    """SM4/ECB/PKCS5Padding encrypt -> bytes."""
    padded = _pad_pkcs5(plaintext)
    if not HAS_NATIVE_SM4:
        return sm4_pure.encrypt_ecb(padded, key)
    enc = Cipher(algorithms.SM4(key), modes.ECB()).encryptor()
    return enc.update(padded) + enc.finalize()


def sm4_decrypt(ciphertext, key):
    """SM4/ECB/PKCS5Padding decrypt -> bytes."""
    if not HAS_NATIVE_SM4:
        return _unpad_pkcs5(sm4_pure.decrypt_ecb(ciphertext, key))
    dec = Cipher(algorithms.SM4(key), modes.ECB()).decryptor()
    return _unpad_pkcs5(dec.update(ciphertext) + dec.finalize())


def _build_datagram(json_str, key, zip_code):
    # The Java demo's SM4Util.sm4Encrypt returns hutool's encryptHex, and the demo base64-encodes that
    # string: the ciphertext travels as base64 of its lowercase hex, not of its bytes. Confirmed against
    # the test gateway (2026-09-30): raw bytes get 1001 加解密失败, hex gets past decryption. Where the
    # hex sits in the gzip layerings is not shown anywhere; it is assumed to replace the ciphertext bytes.
    raw = json_str.encode('utf-8')
    if zip_code == '0':
        return base64.b64encode(_sm4_hex(raw, key)).decode('ascii')
    if zip_code == '1':
        return base64.b64encode(gzip.compress(_sm4_hex(raw, key))).decode('ascii')
    if zip_code == '2':
        inner = base64.b64encode(gzip.compress(raw)).decode('ascii')
        return base64.b64encode(_sm4_hex(inner.encode('utf-8'), key)).decode('ascii')
    raise ValueError(f'invalid zipCode {zip_code!r}')


def _sm4_hex(raw, key):
    return sm4_encrypt(raw, key).hex().encode('ascii')


def _sm4_unhex(data, key):
    return sm4_decrypt(bytes.fromhex(data.decode('ascii')), key)


def _gunzip(data):
    decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
    content = decompressor.decompress(data, MAX_DECOMPRESSED_BYTES)
    if decompressor.unconsumed_tail:
        raise MalformedEnvelope('decompressed datagram too large')
    if not decompressor.eof:
        raise MalformedEnvelope('truncated gzip datagram')
    return content


def _parse_datagram(datagram_b64, key, zip_code):
    if len(datagram_b64) > MAX_DATAGRAM_LENGTH:
        raise MalformedEnvelope('datagram too large')
    raw = base64.b64decode(datagram_b64)
    if zip_code == '0':
        return _sm4_unhex(raw, key).decode('utf-8')
    if zip_code == '1':
        return _sm4_unhex(_gunzip(raw), key).decode('utf-8')
    if zip_code == '2':
        inner = _sm4_unhex(raw, key).decode('ascii')  # base64 of gzip
        return _gunzip(base64.b64decode(inner)).decode('utf-8')
    raise MalformedEnvelope(f'invalid zipCode {zip_code!r}')


def sign(interface_code, zip_code, encrypt_code, access_token, datagram, signtype, key):
    """HMAC-SHA256 over the concatenated fields, keyed by the SM4 key -> UPPERCASE hex."""
    msg = (interface_code + zip_code + encrypt_code + access_token + datagram + signtype).encode('utf-8')
    return hmac.new(key, msg, hashlib.sha256).hexdigest().upper()


def build_request(interface_code, datagram, identity_code, platform_code, tax_no,
                  timestamp=None, zip_code='0'):
    """Build the full outer request envelope (a JSON-serialisable dict).

    :param datagram: the business payload (dict) — will be JSON-encoded.
    :param zip_code: '0'/'1'/'2'
    """
    ts = timestamp or now_timestamp()
    key = derive_sm4_key(identity_code, platform_code, ts)
    access_token = make_access_token(platform_code, tax_no, ts)
    json_str = json.dumps(datagram, ensure_ascii=False, separators=(',', ':'))
    datagram_b64 = _build_datagram(json_str, key, zip_code)
    signature = sign(interface_code, zip_code, ENCRYPT_CODE, access_token, datagram_b64, SIGNTYPE, key)
    return {
        'interfaceCode': interface_code,
        'zipCode': zip_code,
        'encryptCode': ENCRYPT_CODE,
        'access_token': access_token,
        'datagram': datagram_b64,
        'signtype': SIGNTYPE,
        'signature': signature,
    }


def verify_and_decrypt(response, identity_code, platform_code, strict=True):
    """Check the outer code, verify the outer response signature and decrypt the datagram.

    :return: the inner business dict (has its own 'code'/'message').
    :raises AisinoProtocolError: on outer code != 1000 (the datagram is then empty).
    :raises SignatureMismatch: when ``strict`` and the signature doesn't match.
    :raises MalformedEnvelope: when the envelope can't be read.
    """
    if not isinstance(response, dict):
        raise MalformedEnvelope('response is not a JSON object')
    outer_code = str(response.get('code') or '')
    if outer_code != '1000':
        raise AisinoProtocolError(outer_code, response.get('msg') or '')
    signed = [response.get(field) for field in SIGNED_FIELDS]
    signature = response.get('signature')
    if not all(isinstance(value, str) for value in (*signed, signature)):
        raise MalformedEnvelope('missing envelope field')
    try:
        ts = timestamp_from_access_token(response['access_token'])
    except ValueError as e:  # binascii.Error and UnicodeDecodeError included
        raise MalformedEnvelope('invalid access_token') from e
    key = derive_sm4_key(identity_code, platform_code, ts)
    if not hmac.compare_digest(sign(*signed, key), signature):
        # The test gateway's responses (2026-09-30) are not signed over the request's field order, and the
        # spec doesn't say what they are signed over: callers talking to the sandbox may pass strict=False
        # until Aisino tells us.
        if strict:
            raise SignatureMismatch('response signature mismatch')
        _logger.warning("Aisino response signature doesn't match the request scheme; accepted (strict=False)")
    try:
        return json.loads(_parse_datagram(response['datagram'], key, response['zipCode']))
    except (ValueError, zlib.error) as e:
        raise MalformedEnvelope(f'unreadable datagram: {e}') from e


def build_response(interface_code, datagram, identity_code, platform_code,
                   timestamp=None, zip_code='0', code='1000', msg=''):
    """Build a signed outer response envelope (used by the mock server + callback tests)."""
    ts = timestamp or now_timestamp()
    key = derive_sm4_key(identity_code, platform_code, ts)
    access_token = make_access_token(platform_code, '0' * 18, ts)  # tax_no not meaningful on response
    json_str = json.dumps(datagram, ensure_ascii=False, separators=(',', ':'))
    datagram_b64 = _build_datagram(json_str, key, zip_code)
    signature = sign(interface_code, zip_code, ENCRYPT_CODE, access_token, datagram_b64, SIGNTYPE, key)
    return {
        'code': code,
        'msg': msg,
        'interfaceCode': interface_code,
        'zipCode': zip_code,
        'encryptCode': ENCRYPT_CODE,
        'access_token': access_token,
        'datagram': datagram_b64,
        'signtype': SIGNTYPE,
        'signature': signature,
    }
