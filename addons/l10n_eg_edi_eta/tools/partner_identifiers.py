from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


def _validate_foreign_id(value):
    if not (value.isascii() and value.isalnum()):
        raise ValueError
    return value


EG_ADDITIONAL_IDENTIFIERS_METADATA = {
    'EG_FID': {
        'sequence': 20,
        'category': 'CN',
        'label': _lt('Foreign ID'),
        'help': _lt('Identification number (e.g. passport number) of a non-Egyptian individual.'),
        'placeholder': 'A12345678',
        'validation_function': _validate_foreign_id,
        'countries': ['EG'],
    },
}
