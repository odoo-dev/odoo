# Part of Odoo. See LICENSE file for full copyright and licensing details.


def gmc_format_price(price, currency):
    return f"{currency.round(price)} {currency.name}"


def format_quantity(quantity, uom, to_uom):
    """Convert and format to a non-negative integer.

    :param float quantity: Quantity to convert.
    :param uom.uom uom: Unit of measure of ``quantity``.
    :param uom.uom to_uom: Target unit of measure.
    :rtype: int
    """
    return max(int(uom._compute_quantity(quantity, to_unit=to_uom, rounding_method="DOWN")), 0)
