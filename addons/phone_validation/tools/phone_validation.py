# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _
from odoo.exceptions import UserError

import logging

_logger = logging.getLogger(__name__)
_phonenumbers_lib_warning = False


try:
    import phonenumbers

    def phone_parse(number, country_code):
        try:
            phone_nbr = phonenumbers.parse(number, region=country_code or None, keep_raw_input=True)
        except phonenumbers.phonenumberutil.NumberParseException as e:
            raise UserError(_('Unable to parse %(phone)s: %(error)s', phone=number, error=str(e)))

        if not phonenumbers.is_possible_number(phone_nbr):
            reason = phonenumbers.is_possible_number_with_reason(phone_nbr)
            if reason == phonenumbers.ValidationResult.INVALID_COUNTRY_CODE:
                raise UserError(_('Impossible number %s: not a valid country prefix.', number))
            if reason == phonenumbers.ValidationResult.TOO_SHORT:
                raise UserError(_('Impossible number %s: not enough digits.', number))
            # in case of "TOO_LONG", we may try to reformat the number in case it was
            # entered without '+' prefix or using leading '++' not always recognized;
            # in any case final error should keep the original number to ease tracking
            if reason == phonenumbers.ValidationResult.TOO_LONG:
                # people may enter 0033... instead of +33...
                if number.startswith('00'):
                    try:
                        phone_nbr = phone_parse(f'+{number.lstrip("00")}', country_code)
                    except UserError:
                        raise UserError(_('Impossible number %s: too many digits.', number))
                # people may enter 33... instead of +33...
                elif not number.startswith('+'):
                    try:
                        phone_nbr = phone_parse(f'+{number}', country_code)
                    except UserError:
                        raise UserError(_('Impossible number %s: too many digits.', number))
                else:
                    raise UserError(_('Impossible number %s: too many digits.', number))
            else:
                raise UserError(_("The number %s does not appear to be a valid number unless you're dialing aliens. Let's fix it for this dimension!", number))
        if not phonenumbers.is_valid_number(phone_nbr):
            raise UserError(_('Invalid number %s: probably incorrect prefix.', number))

        return phone_nbr

    def phone_format(number, country_code, country_phone_code, force_format='INTERNATIONAL', raise_exception=True):
        """ Format the given phone number according to the localisation and international options.
        :param number: number to convert
        :param country_code: the ISO country code in two chars
        :type country_code: str
        :param country_phone_code: country dial in codes, defined by the ITU-T (Ex: 32 for Belgium)
        :type country_phone_code: int
        :param force_format: stringified version of format globals (see
          https://github.com/daviddrysdale/python-phonenumbers/blob/dev/python/phonenumbers/phonenumberutil.py)
            'E164' = 0
            'INTERNATIONAL' = 1
            'NATIONAL' = 2
            'RFC3966' = 3
        :type force_format: str
        :rtype: str
        """
        try:
            phone_nbr = phone_parse(number, country_code)
        except (phonenumbers.phonenumberutil.NumberParseException, UserError) as e:
            if raise_exception:
                raise
            else:
                return number
        if force_format == 'E164':
            phone_fmt = phonenumbers.PhoneNumberFormat.E164
        elif force_format == 'RFC3966':
            phone_fmt = phonenumbers.PhoneNumberFormat.RFC3966
        elif force_format == 'INTERNATIONAL' or phone_nbr.country_code != country_phone_code:
            phone_fmt = phonenumbers.PhoneNumberFormat.INTERNATIONAL
        else:
            phone_fmt = phonenumbers.PhoneNumberFormat.NATIONAL
        return phonenumbers.format_number(phone_nbr, phone_fmt)

    def phone_get_region_data_for_number(number):
        try:
            phone_obj = phone_parse(number, None)
        except (phonenumbers.phonenumberutil.NumberParseException, UserError):
            return {
                'code': '',
                'national_number': '',
                'phone_code': '',
            }
        return {
            'code': phonenumbers.phonenumberutil.region_code_for_number(phone_obj),
            'national_number': str(phone_obj.national_number),
            'phone_code': str(phone_obj.country_code),
        }

except ImportError:

    def phone_parse(number, country_code):
        return False

    def phone_format(number, country_code, country_phone_code, force_format='INTERNATIONAL', raise_exception=True):
        global _phonenumbers_lib_warning
        if not _phonenumbers_lib_warning:
            _logger.info(
                "The `phonenumbers` Python module is not installed, contact numbers will not be "
                "verified. Please install the `phonenumbers` Python module."
            )
            _phonenumbers_lib_warning = True
        return number

    def phone_get_region_code_for_number(number):
        return {
            'code': '',
            'national_number': '',
            'phone_code': '',
        }


def phone_sanitize_numbers(numbers, country_code, country_phone_code, force_format='E164'):
    """ Given a list of numbers, return parsezd and sanitized information

    :return dict: {number: {
        'sanitized': sanitized and formated number or False (if cannot format)
        'code': 'empty' (number was a void string), 'invalid' (error) or False (sanitize ok)
        'msg': error message when 'invalid'
    }}
    """
    if not isinstance(numbers, (list)):
        raise NotImplementedError()
    result = dict.fromkeys(numbers, False)
    for number in numbers:
        if not number:
            result[number] = {'sanitized': False, 'code': 'empty', 'msg': False}
            continue
        try:
            stripped = number.strip()
            sanitized = phone_format(
                stripped, country_code, country_phone_code,
                force_format=force_format, raise_exception=True)
        except Exception as e:
            result[number] = {'sanitized': False, 'code': 'invalid', 'msg': str(e)}
        else:
            result[number] = {'sanitized': sanitized, 'code': False, 'msg': False}
    return result


def phone_sanitize_numbers_w_record(numbers, record, country=False, record_country_fname='country_id', force_format='E164'):
    if not isinstance(numbers, (list)):
        raise NotImplementedError()
    if not country:
        if record and record_country_fname and hasattr(record, record_country_fname) and record[record_country_fname]:
            country = record[record_country_fname]
        elif record:
            country = record.env.company.country_id
    country_code = country.code if country else None
    country_phone_code = country.phone_code if country else None
    return phone_sanitize_numbers(numbers, country_code, country_phone_code, force_format=force_format)
