import logging

import requests

from odoo import _
from odoo.exceptions import ValidationError
from odoo.tools import float_round

_logger = logging.getLogger(__name__)

API_VERSION = '2024-06-20'

STRIPE_VALID_JOURNAL_CURRENCIES = {
    'US': 'USD',
    'EU': 'EUR',
    'UK': 'GBP',
    'GB': 'GBP',
}

HANDLED_WEBHOOK_EVENTS = {
    'issuing_authorization.request',
    'issuing_transaction.created',
    'issuing_card.created',
    'issuing_card.updated',
    'issuing_cardholder.created',
    'issuing_cardholder.updated',
}

# The countries supported by Stripe. See https://stripe.com/global page.
SUPPORTED_COUNTRIES = {
    'AE',
    'AT',
    'AU',
    'BE',
    'BG',
    'BR',
    'CA',
    'CH',
    'CY',
    'CZ',
    'DE',
    'DK',
    'EE',
    'ES',
    'FI',
    'FR',
    'GB',
    'GI',  # Beta
    'GR',
    'HK',
    'HR',  # Beta
    'HU',
    'ID',  # Beta
    'IE',
    'IT',
    'JP',
    'LI',  # Beta
    'LT',
    'LU',
    'LV',
    'MT',
    'MX',
    'MY',
    'NL',
    'NO',
    'NZ',
    'PH',  # Beta
    'PL',
    'PT',
    'RO',
    'SE',
    'SG',
    'SI',
    'SK',
    'TH',  # Beta
    'US',
}
# Businesses in supported outlying territories should register for a Stripe account with the parent
# territory selected as the Country.
# See https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries.
COUNTRY_MAPPING = {
    'MQ': 'FR',  # Martinique
    'GP': 'FR',  # Guadeloupe
    'GF': 'FR',  # French Guiana
    'RE': 'FR',  # Réunion
    'YT': 'FR',  # Mayotte
    'MF': 'FR',  # Saint-Martin
}
STRIPE_3D_SECURE_LOCALES = {
    'de'
    'en',
    'es',
    'fr',
    'it',
}
STRIPE_ERRORS = {
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Request Failed',
    '403': 'Forbidden',
    '404': 'Not Found',
    '409': 'Conflict',
    '429': 'Too Many Requests',
    '5': 'Server Errors',
}

def get_publishable_key():
    """ Return the publishable key for Stripe.

    Note: This method serves as a hook for modules that would fully implement Stripe Connect.
    :return: The publishable key
    :rtype: str
    """
    return False


def get_secret_key():
    """ Return the secret key for Stripe.

    Note: This method serves as a hook for modules that would fully implement Stripe Connect.
    :return: The secret key
    :rtype: str
    """
    return False


# According to https://en.wikipedia.org/wiki/ISO_4217#Minor_unit_fractions
# Taken from payment module TODO JUAL: Do we move it deeper?
CURRENCY_MINOR_UNITS = {
    'ADF': 2,
    'ADP': 0,
    'AED': 2,
    'AFA': 2,
    'AFN': 2,
    'ALL': 2,
    'AMD': 2,
    'ANG': 2,
    'AOA': 2,
    'AOK': 0,
    'AON': 0,
    'AOR': 0,
    'ARA': 2,
    'ARL': 2,
    'ARP': 2,
    'ARS': 2,
    'ATS': 2,
    'AUD': 2,
    'AWG': 2,
    'AYM': 0,
    'AZM': 2,
    'AZN': 2,
    'BAD': 2,
    'BAM': 2,
    'BBD': 2,
    'BDS': 2,
    'BDT': 2,
    'BEF': 2,
    'BGL': 2,
    'BGN': 2,
    'BHD': 3,
    'BIF': 0,
    'BMD': 2,
    'BND': 2,
    'BOB': 2,
    'BOP': 2,
    'BOV': 2,
    'BRB': 2,
    'BRC': 2,
    'BRE': 2,
    'BRL': 2,
    'BRN': 2,
    'BRR': 2,
    'BSD': 2,
    'BTN': 2,
    'BWP': 2,
    'BYB': 2,
    'BYN': 2,
    'BYR': 0,
    'BZD': 2,
    'CAD': 2,
    'CDF': 2,
    'CHC': 2,
    'CHE': 2,
    'CHF': 2,
    'CHW': 2,
    'CLF': 4,
    'CLP': 0,
    'CNH': 2,
    'CNT': 2,
    'CNY': 2,
    'COP': 2,
    'COU': 2,
    'CRC': 2,
    'CSD': 2,
    'CUC': 2,
    'CUP': 2,
    'CVE': 2,
    'CYP': 2,
    'CZK': 2,
    'DEM': 2,
    'DJF': 0,
    'DKK': 2,
    'DOP': 2,
    'DZD': 2,
    'ECS': 0,
    'ECV': 2,
    'EEK': 2,
    'EGP': 2,
    'ERN': 2,
    'ESP': 0,
    'ETB': 2,
    'EUR': 2,
    'FIM': 2,
    'FJD': 2,
    'FKP': 2,
    'FRF': 2,
    'GBP': 2,
    'GEK': 0,
    'GEL': 2,
    'GGP': 2,
    'GHC': 2,
    'GHP': 2,
    'GHS': 2,
    'GIP': 2,
    'GMD': 2,
    'GNF': 0,
    'GTQ': 2,
    'GWP': 2,
    'GYD': 2,
    'HKD': 2,
    'HNL': 2,
    'HRD': 2,
    'HRK': 2,
    'HTG': 2,
    'HUF': 2,
    'IDR': 2,
    'IEP': 2,
    'ILR': 2,
    'ILS': 2,
    'IMP': 2,
    'INR': 2,
    'IQD': 3,
    'IRR': 2,
    'ISJ': 2,
    'ISK': 0,
    'ITL': 0,
    'JEP': 2,
    'JMD': 2,
    'JOD': 3,
    'JPY': 0,
    'KES': 2,
    'KGS': 2,
    'KHR': 2,
    'KID': 2,
    'KMF': 0,
    'KPW': 2,
    'KRW': 0,
    'KWD': 3,
    'KYD': 2,
    'KZT': 2,
    'LAK': 2,
    'LBP': 2,
    'LKR': 2,
    'LRD': 2,
    'LSL': 2,
    'LTL': 2,
    'LTT': 2,
    'LUF': 2,
    'LVL': 2,
    'LVR': 2,
    'LYD': 3,
    'MAD': 2,
    'MAF': 2,
    'MCF': 2,
    'MDL': 2,
    'MGA': 2,
    'MGF': 0,
    'MKD': 2,
    'MMK': 2,
    'MNT': 2,
    'MOP': 2,
    'MRO': 2,
    'MRU': 2,
    'MTL': 2,
    'MUR': 2,
    'MVR': 2,
    'MWK': 2,
    'MXN': 2,
    'MXV': 2,
    'MYR': 2,
    'MZE': 2,
    'MZM': 2,
    'MZN': 2,
    'NAD': 2,
    'NGN': 2,
    'NIC': 2,
    'NIO': 2,
    'NIS': 2,
    'NLG': 2,
    'NOK': 2,
    'NPR': 2,
    'NTD': 2,
    'NZD': 2,
    'OMR': 3,
    'PAB': 2,
    'PEN': 2,
    'PES': 2,
    'PGK': 2,
    'PHP': 2,
    'PKR': 2,
    'PLN': 2,
    'PLZ': 2,
    'PRB': 2,
    'PTE': 0,
    'PYG': 0,
    'QAR': 2,
    'RHD': 2,
    'RMB': 2,
    'ROL': 0,
    'RON': 2,
    'RSD': 2,
    'RUB': 2,
    'RUR': 2,
    'RWF': 0,
    'SAR': 2,
    'SBD': 2,
    'SCR': 2,
    'SDD': 2,
    'SDG': 2,
    'SEK': 2,
    'SGD': 2,
    'SHP': 2,
    'SIT': 2,
    'SKK': 2,
    'SLE': 2,
    'SLL': 2,
    'SLS': 2,
    'SML': 0,
    'SOS': 2,
    'SRD': 2,
    'SRG': 2,
    'SSP': 2,
    'STD': 2,
    'STG': 2,
    'STN': 2,
    'SVC': 2,
    'SYP': 2,
    'SZL': 2,
    'THB': 2,
    'TJR': 0,
    'TJS': 2,
    'TMM': 2,
    'TMT': 2,
    'TND': 3,
    'TOP': 2,
    'TPE': 0,
    'TRL': 0,
    'TRY': 2,
    'TTD': 2,
    'TVD': 2,
    'TWD': 2,
    'TZS': 2,
    'UAH': 2,
    'UAK': 2,
    'UGX': 0,
    'USD': 2,
    'USN': 2,
    'USS': 2,
    'UYI': 0,
    'UYN': 2,
    'UYU': 2,
    'UYW': 4,
    'UZS': 2,
    'VAL': 0,
    'VEB': 2,
    'VED': 2,
    'VEF': 2,
    'VES': 2,
    'VND': 0,
    'VUV': 0,
    'WST': 2,
    'XAF': 0,
    'XCD': 2,
    'XEU': 0,
    'XOF': 0,
    'XPF': 0,
    'YER': 2,
    'YUD': 2,
    'YUG': 2,
    'YUM': 2,
    'YUN': 2,
    'YUO': 2,
    'YUR': 2,
    'ZAL': 2,
    'ZAR': 2,
    'ZMK': 2,
    'ZMW': 2,
    'ZRN': 2,
    'ZRZ': 2,
    'ZWB': 2,
    'ZWC': 2,
    'ZWD': 2,
    'ZWL': 2,
    'ZWN': 2,
    'ZWR': 2
}

STRIPE_EXCEPTIONS_CURRENCY_MINOR_UNITS = {
    'ISK': 2,
    'HUF': 2,
    'TWD': 2,
    'UGX': 2,
}


def to_major_currency_units(minor_amount, currency, arbitrary_decimal_number=None):
    """ Return the amount converted to the major units of its currency.

    The conversion is done by dividing the amount by 10^k where k is the number of decimals of the
    currency as per the ISO 4217 norm.
    To force a different number of decimals, set it as the value of the `arbitrary_decimal_number`
    argument.

    :param float minor_amount: The amount in minor units, to convert in major units
    :param recordset currency: The currency of the amount, as a `res.currency` record
    :param int arbitrary_decimal_number: The number of decimals to use instead of that of ISO 4217
    :return: The amount in major units of its currency
    :rtype: int
    """
    # TODO JUAL: Taken from payment, do we move it deeper?
    if arbitrary_decimal_number is None:
        currency.ensure_one()
        decimal_number = CURRENCY_MINOR_UNITS.get(currency.name, currency.decimal_places)
    else:
        decimal_number = arbitrary_decimal_number
    return float_round(minor_amount, precision_digits=0) / (10**decimal_number)


def to_minor_currency_units(major_amount, currency, arbitrary_decimal_number=None):
    """ Return the amount converted to the minor units of its currency.

    The conversion is done by multiplying the amount by 10^k where k is the number of decimals of
    the currency as per the ISO 4217 norm.
    To force a different number of decimals, set it as the value of the `arbitrary_decimal_number`
    argument.

    Note: currency.ensure_one() if arbitrary_decimal_number is not provided

    :param float major_amount: The amount in major units, to convert in minor units
    :param recordset currency: The currency of the amount, as a `res.currency` record
    :param int arbitrary_decimal_number: The number of decimals to use instead of that of ISO 4217
    :return: The amount in minor units of its currency
    :rtype: int
    """
    # TODO JUAL: Taken from payment, do we move it deeper?
    if arbitrary_decimal_number is None:
        currency.ensure_one()
        decimal_number = CURRENCY_MINOR_UNITS.get(currency.name, currency.decimal_places)
    else:
        decimal_number = arbitrary_decimal_number
    return int(
        float_round(major_amount * (10**decimal_number), precision_digits=0, rounding_method='DOWN')
    )


def format_amount_from_stripe(amount, currency):
    """ Helper to convert currencies according to stripe formatting which is the amount in the currency's minor unit with exceptions  """
    return to_major_currency_units(amount, currency, arbitrary_decimal_number=STRIPE_EXCEPTIONS_CURRENCY_MINOR_UNITS.get(currency.name))

def format_amount_to_stripe(amount, currency):
    """ Helper to convert currencies according from stripe formatting which is the amount in the currency's minor unit with exceptions  """
    return to_minor_currency_units(amount, currency, arbitrary_decimal_number=STRIPE_EXCEPTIONS_CURRENCY_MINOR_UNITS.get(currency.name))

def stripe_make_request(api_key, endpoint, payload=None, method='POST', offline=False, idempotency_key=None):
    """
    Make a request to Stripe API at the specified endpoint.

    Note: self.ensure_one()

    :param str endpoint: The endpoint to be reached by the request
    :param dict payload: The payload of the request
    :param str method: The HTTP method of the request
    :param bool offline: Whether the operation of the transaction being processed is 'offline'
    :param str idempotency_key: The idempotency key to pass in the request.
    :return The JSON-formatted content of the response
    :rtype: dict
    :raise: ValidationError if an HTTP error occurs
    """

    url = '/'.join(('https://api.stripe.com/v1', endpoint))
    headers = {
        'AUTHORIZATION': f'Bearer {api_key}',
        'Stripe-Version': API_VERSION,  # SetupIntent requires a specific version.
    }
    if method == 'POST' and idempotency_key:
        headers['Idempotency-Key'] = idempotency_key
    try:
        response = requests.request(method, url, data=payload, headers=headers, timeout=60)
        # Stripe can send 4XX errors for payment failures (not only for badly-formed requests).
        # Check if an error code is present in the response content and raise only if not.
        # See https://stripe.com/docs/error-codes.
        # If the request originates from an offline operation, don't raise to avoid a cursor
        # rollback and return the response as-is for flow-specific handling.
        if (
                not response.ok
                and not offline
                and 400 <= response.status_code < 500
                and response.json().get('error')
        ):  # The 'code' entry is sometimes missing
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError:
                _logger.exception("invalid API request at %s with data %s", url, payload)
                error_msg = response.json().get('error', {}).get('message', '')
                raise ValidationError(
                    "Stripe: " + _(
                        "The communication with the API failed.\n"
                        "Stripe gave us the following info about the problem:\n'%s'", error_msg
                    )
                )
    except requests.exceptions.ConnectionError:
        _logger.exception("unable to reach endpoint at %s", url)
        raise ValidationError("Stripe: " + _("Could not establish the connection to the API."))
    return response.json()
