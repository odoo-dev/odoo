# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo.addons.payment_kueski import const


def format_address(partner):
    """Format the partner address to comply with Kueski's "Address Model".

    :param res.partner partner: The partner whose address to format.
    :return: The formatted address.
    :rtype: dict
    """
    street_data = partner._get_street_split()
    colony = partner["l10n_mx_edi_colony"] if "l10n_mx_edi_colony" in partner._fields else ""
    return {
        "street": street_data["street_name"],
        "exterior": street_data["street_number"],
        "interior": street_data["street_number2"] or partner.street2,
        "neighborhood": colony,
        "city": partner.city,
        "state": partner.state_id.name,
        "zipcode": partner.zip and partner.zip.strip(),
        "country": partner.country_id.code,
    }


def is_address_complete(address):
    """Return whether the address has all the fields that Kueski requires, with a valid zipcode.

    :param dict address: The address formatted by `format_address`.
    :return: Whether the address is complete.
    :rtype: bool
    """
    has_valid_zipcode = bool(re.fullmatch(r"\d{5,}", address["zipcode"] or ""))
    return has_valid_zipcode and all(address[field] for field in const.REQUIRED_ADDRESS_FIELDS)


def format_phone(phone):
    """Keep only the digits and the plus sign of the phone, as Kueski caps it at 15 characters.

    :param str phone: The phone number to format.
    :return: The formatted phone number.
    :rtype: str
    """
    return re.sub(r"[^\d+]", "", phone or "")


def drop_empty_values(values):
    """Recursively remove the empty values from the dict.

    :param dict values: The values to clean.
    :return: The values without the empty ones.
    :rtype: dict
    """
    cleaned = {}
    for key, value in values.items():
        if isinstance(value, dict):
            value = drop_empty_values(value)
        if value:
            cleaned[key] = value
    return cleaned
