# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.http import request
from odoo.tools import float_round
from odoo.tools.translate import html_translate

from odoo.addons.website.models import ir_http


class ProductTemplate(models.Model):
    _inherit = "product.template"

    allow_out_of_stock_order = fields.Boolean(string="Sell when Out-of-Stock", default=True)
    website_auto_unpublished = fields.Boolean(
        string="Auto-unpublished due to stock", default=False, copy=False
    )

    def write(self, vals):
        # When a user manually republishes a product that was auto-unpublished,
        # clear the flag so it won't be auto-unpublished again until stock
        # actually changes next time.
        if vals.get("is_published") or vals.get("website_published"):
            if not self.env.context.get("website_sale_stock_auto_publish"):
                vals = dict(vals, website_auto_unpublished=False)
        return super().write(vals)

    def _check_and_update_website_published(self):
        """Auto-publish or unpublish a product based on stock availability.

        This method is called when stock moves are validated or inventory quantities
        are manually updated. It checks every website that has the
        "Unpublish out-of-stock products" setting enabled and updates the
        ``is_published`` flag accordingly.

        Rules:
        - Only unpublish if *all* variants of the product are out of stock.
        - Republish when at least one variant has available stock.
        - Never unpublish a product whose ``allow_out_of_stock_order`` flag is set
          (selling when out-of-stock is allowed at the product level).
        - If the product was manually republished while still out of stock, keep
          it published (website_auto_unpublished is False in that case).
        - Apply unpublish threshold based on the smallest packaging unit available
          on the website.
        """
        websites = self.env["website"].search([("unpublish_out_of_stock_products", "=", True)])
        if not websites:
            return

        for template in self.sudo():
            if not template.is_storable or template.allow_out_of_stock_order:
                continue

            variants = template.product_variant_ids
            if not variants:
                continue

            # A product is considered fully out of stock only when every variant
            # is out of stock on every website with the setting enabled.
            all_sold_out = all(
                variant._is_sold_out_for_website(website)
                for website in websites
                for variant in variants
            )

            if all_sold_out:
                # Only auto-unpublish if the product is currently published AND
                # was not manually republished by a user while still out of stock
                # (website_auto_unpublished=False after a manual republish means
                # the user wants to keep it published despite low stock).
                if template.is_published and not template.website_auto_unpublished:
                    template.with_context(website_sale_stock_auto_publish=True).write({
                        "is_published": False,
                        "website_auto_unpublished": True,
                    })
            # Stock is back: republish only if we were the ones who unpublished it.
            # Never republish products that were unpublished before this feature
            # touched them (website_auto_unpublished would be False for those).
            elif template.website_auto_unpublished:
                template.with_context(website_sale_stock_auto_publish=True).write({
                    "is_published": True,
                    "website_auto_unpublished": False,
                })

    available_threshold = fields.Float(string="Show Threshold", default=5.0)
    show_availability = fields.Boolean(string="Show availability Qty", default=False)
    out_of_stock_message = fields.Html(string="Out-of-Stock Message", translate=html_translate)

    def _is_sold_out(self):
        """Return whether the product is sold out (no available quantity).

        If a product inventory is not tracked, or if it's allowed to be sold regardless
        of availabilities, the product is never considered sold out.

        Note: only checks the availability of the first variant of the template.

        :return: whether the product can still be sold
        :rtype: bool
        """
        if not self.is_storable or self.allow_out_of_stock_order:
            return False
        return not self.product_variant_id or self.product_variant_id._is_sold_out()

    def _website_show_quick_add(self):
        return super()._website_show_quick_add() and not self._is_sold_out()

    def _get_additionnal_combination_info(self, product_or_template, quantity, uom, date, website):
        res = super()._get_additionnal_combination_info(
            product_or_template, quantity, uom, date, website
        )

        if not self.env.context.get("website_sale_product_page"):
            return res

        if product_or_template.type == "combo":
            # The max quantity of a combo product is the max quantity of its combo with the lowest
            # max quantity. If none of the combos has a max quantity, then the combo product also
            # has no max quantity.
            max_quantities = [
                max_quantity
                for combo in product_or_template.sudo().combo_ids
                if (max_quantity := combo._get_max_quantity(website, request.cart)) is not None
            ]
            if max_quantities:
                # No uom conversion: combo are not supposed to be sold with other uoms.
                res["max_combo_quantity"] = min(max_quantities)

        if not product_or_template.is_storable:
            return res

        res.update({
            "is_storable": True,
            "allow_out_of_stock_order": product_or_template.allow_out_of_stock_order,
            "available_threshold": product_or_template.available_threshold,
        })
        if product_or_template.is_product_variant:
            product_sudo = product_or_template.sudo()
            computed_qty = product_sudo.uom_id._compute_quantity(
                website._get_product_available_qty(product_sudo), to_unit=uom, round=False
            )
            free_qty = float_round(computed_qty, precision_digits=0, rounding_method="DOWN")
            has_stock_notification = product_sudo._has_stock_notification(
                self.env.user.partner_id
            ) or (
                request
                and product_sudo.id
                in request.session.get("product_with_stock_notification_enabled", set())
            )
            stock_notification_email = request and request.session.get(
                "stock_notification_email", ""
            )
            cart_quantity = 0.0
            if not product_sudo.allow_out_of_stock_order:
                cart_quantity = product_sudo.uom_id._compute_quantity(
                    request.cart._get_cart_qty(product_sudo.id), to_unit=uom
                )
            digits = self.env["decimal.precision"].precision_get("Product Unit")
            rounding = 10**-digits
            res.update({
                "free_qty": free_qty,
                "cart_qty": cart_quantity,
                "uom_name": uom.name,
                "uom_rounding": rounding,
                "show_availability": product_sudo.show_availability,
                "out_of_stock_message": product_sudo.out_of_stock_message,
                "has_stock_notification": has_stock_notification,
                "stock_notification_email": stock_notification_email,
            })
        else:
            res.update({"free_qty": 0, "cart_qty": 0})

        if product_or_template.is_product_variant:
            product_sudo = product_or_template.sudo()
            res["is_in_wishlist"] = product_sudo._is_in_wishlist()

        return res

    @api.model
    def _get_additional_configurator_data(
        self, product_or_template, date, currency, pricelist, *, uom=None, **kwargs
    ):
        """Override of `website_sale` to append stock data.

        :param product.product|product.template product_or_template: The product for which to get
            additional data.
        :param datetime date: The date to use to compute prices.
        :param res.currency currency: The currency to use to compute prices.
        :param product.pricelist pricelist: The pricelist to use to compute prices.
        :param uom.uom uom: The uom to use to compute prices.
        :param dict kwargs: Locally unused data passed to overrides.
        :rtype: dict
        :return: A dict containing additional data about the specified product.
        """
        data = super()._get_additional_configurator_data(
            product_or_template, date, currency, pricelist, **kwargs
        )

        if (website := ir_http.get_request_website()) and product_or_template.is_product_variant:
            max_quantity = product_or_template._get_max_quantity(website, request.cart, **kwargs)
            if max_quantity is not None:
                if uom:
                    max_quantity = product_or_template.uom_id._compute_quantity(
                        max_quantity, to_unit=uom
                    )
                data["free_qty"] = max_quantity
        return data
