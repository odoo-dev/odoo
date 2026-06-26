# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.http import request

from odoo.addons.website_sale.utils import format_quantity


class ProductTemplate(models.Model):
    _inherit = "product.template"

    def _prepare_delivery_availability_info(self, product_sudo, uom, website, **kwargs):
        delivery_info = super()._prepare_delivery_availability_info(
            product_sudo, uom, website, in_store=False, **kwargs
        )

        valid_in_store_dm = website.sudo().in_store_dm_id.filtered_domain(
            website._get_available_delivery_methods_domain(product=product_sudo, **kwargs)
        )
        delivery_info.update({
            "show_in_store_availability": bool(valid_in_store_dm),
            "uom_id": uom.id,
            "quantity_in_store": None,
        })
        if not valid_in_store_dm:
            return delivery_info

        order_sudo = (
            request.cart
            if (request and hasattr(request, "cart"))
            else self.env["sale.order"].sudo()
        )
        if (
            order_sudo.carrier_id.delivery_type == "in_store"
            and order_sudo.partner_shipping_id.pickup_location_data
        ):  # Get stock values for the product variant in the selected store.
            quantity_in_store = product_sudo._get_free_qty(
                warehouse_id=order_sudo.partner_shipping_id.pickup_location_data["id"]
            )
        else:
            quantity_in_store = website.sudo()._get_max_in_store_product_available_qty(product_sudo)
        delivery_info["quantity_in_store"] = format_quantity(
            quantity_in_store, product_sudo.uom_id, uom
        )

        return delivery_info
