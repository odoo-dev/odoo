# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging

from odoo import models, tools

_logger = logging.getLogger(__name__)

try:
    from num2words import num2words
except ImportError:
    _logger.warning("The num2words python library is not installed, amount-to-text features won't be fully available.")
    num2words = None

UAH_UNIT_FORMS = ('гривня', 'гривні', 'гривень')
UAH_SUBUNIT_FORMS = ('копійка', 'копійки', 'копійок')


def _l10n_ua_pluralize(number, forms):
    """ Ukrainian grammar: the noun following a number takes one of 3 forms
        depending on the last digit(s) of that number. """
    one, few, many = forms
    number = abs(number)
    if number % 100 in (11, 12, 13, 14):
        return many
    if number % 10 == 1:
        return one
    if number % 10 in (2, 3, 4):
        return few
    return many


class ResCurrency(models.Model):
    _inherit = 'res.currency'

    def amount_to_text(self, amount):
        self.ensure_one()
        lang = tools.get_lang(self.env)
        if num2words is None or self.name != 'UAH' or lang.iso_code != 'uk':
            return super().amount_to_text(amount)

        def _to_words(number):
            try:
                return num2words(number, lang='uk')
            except NotImplementedError:
                return num2words(number, lang='en')

        integral, _sep, fractional = f"{amount:.{self.decimal_places}f}".partition('.')
        integer_value = int(integral)
        integral_text = f"{_to_words(integer_value)} {_l10n_ua_pluralize(integer_value, UAH_UNIT_FORMS)}"
        if self.is_zero(amount - integer_value):
            return integral_text

        fractional_value = int(fractional or 0)
        fractional_text = f"{_to_words(fractional_value)} {_l10n_ua_pluralize(fractional_value, UAH_SUBUNIT_FORMS)}"
        return f"{integral_text} і {fractional_text}"
