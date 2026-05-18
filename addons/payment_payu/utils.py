# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib


def sha512(message: str):
    """Return SHA512 hex digest in lowercase."""
    return hashlib.sha512(message.encode('utf-8')).hexdigest().lower()


def generate_payu_hash(payload, hash_sequence):
    """
    Generate SHA512 hash for PayU transaction request.

    hashSequence = key|txnid|amount|productinfo|firstname|email|udf1..udf10|salt
    """
    hash_keys = hash_sequence.split("|")
    hash_string = '|'.join(str(payload.get(key, '')) for key in hash_keys)
    return sha512(hash_string)
