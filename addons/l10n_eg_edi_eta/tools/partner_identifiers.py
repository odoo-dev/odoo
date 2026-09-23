import re

from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

# The ETA rejects foreign buyer ids longer than 9 characters, despite its schema allowing 30.
PASSPORT_RE = re.compile(r'[A-Za-z0-9]{1,9}')


def _validate_passport(value):
    if not PASSPORT_RE.fullmatch(value):
        raise ValueError
    return value


EG_ADDITIONAL_IDENTIFIERS_METADATA = {
    'EG_PASSPORT': {
        'sequence': 20,
        'category': 'CN',
        'label': _lt('Passport ID'),
        'help': _lt('Passport number (up to 9 letters or digits) of a non-Egyptian individual.'),
        'placeholder': 'L898902C',
        'validation_function': _validate_passport,
        'countries': ['EG'],
    },
}
