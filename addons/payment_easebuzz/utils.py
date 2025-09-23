import hashlib


def sha512(message):
    return hashlib.sha512(message.encode('utf-8')).hexdigest()


def compute_hash_payload(payload, hash_sequence):
    hash_keys = hash_sequence.split("|")
    hash_string = '|'.join(str(payload.get(key, '')) for key in hash_keys)

    return sha512(hash_string)
