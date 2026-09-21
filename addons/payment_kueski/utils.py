# Part of Odoo. See LICENSE file for full copyright and licensing details.


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
        "zipcode": partner.zip,
        "country": partner.country_id.code,
    }


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
