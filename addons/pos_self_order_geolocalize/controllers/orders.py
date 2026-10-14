# Part of Odoo. See LICENSE file for full copyright and licensing details.

import math

from odoo.addons.pos_self_order.controllers import orders


def _haversine_distance(lat1, long1, lat2, long2):
    """Compute the straight-line distance in km between two lat/long points."""
    R = 6371  # earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlong = math.radians(long2 - long1)
    arcsin = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
        * math.sin(dlong / 2) ** 2
    )
    return 2 * R * math.atan2(math.sqrt(arcsin), math.sqrt(1 - arcsin))


class PosSelfOrderController(orders.PosSelfOrderController):

    def _check_partner_for_preset(self, preset, partner):
        if preset.service_at == 'delivery':
            return self._check_delivery_address_for_partner(preset, partner)
        return super()._check_partner_for_preset(preset, partner)

    def _check_delivery_address_for_partner(self, preset, partner):
        if not partner.partner_latitude and not partner.partner_longitude:
            partner.geo_localize()
        if not partner.partner_latitude and not partner.partner_longitude:
            return {
                'type': 'address',
                'message': self.env._("We couldn't locate this address. Please enter a complete address with a street number."),
            }
        if not preset.delivery_from_latitude and not preset.delivery_from_longitude:
            return None
        distance_km = _haversine_distance(
            partner.partner_latitude, partner.partner_longitude,
            preset.delivery_from_latitude, preset.delivery_from_longitude,
        )
        max_distance = preset.delivery_max_distance_km
        max_distance_km = max_distance * 1.60934 if preset.delivery_distance_unit == 'mi' else max_distance
        if max_distance_km and distance_km > max_distance_km:
            return {
                'type': 'delivery',
                'message': self.env._("Delivery isn't available for this address. You can still place your order using another method."),
            }
        return None
