# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.fields import Domain
from odoo.http import request


class ResPartner(models.Model):
    _inherit = "res.partner"

    wishes_count = fields.Integer(
        string="Number of eCommerce wishes", compute="_compute_wishes_count"
    )

    # === COMPUTE METHODS === #

    def _compute_wishes_count(self):
        self.wishes_count = 0
        wishes_data = self.env["product.wishlist"]._read_group(
            domain=[("partner_id", "in", self.ids)],
            groupby=["partner_id"],
            aggregates=["product_id:count_distinct"],
        )
        for partner, count in wishes_data:
            partner.wishes_count = count

    # === ONCHANGE METHODS === #

    @api.onchange("property_product_pricelist")
    def _onchange_property_product_pricelist(self):
        open_order = (
            self
            .env["sale.order"]
            .sudo()
            .search(
                [
                    ("partner_id", "=", self._origin.id),
                    ("pricelist_id", "=", self._origin.property_product_pricelist.id),
                    ("pricelist_id", "!=", self.property_product_pricelist.id),
                    ("website_id", "!=", False),
                    ("state", "=", "draft"),
                ],
                limit=1,
            )
        )

        if open_order:
            return {
                "warning": {
                    "title": _("Open Sale Orders"),
                    "message": _(
                        "This partner has an open cart. "
                        "Please note that the pricelist will not be updated on that cart. "
                        "Also, the cart might not be visible for the customer until you update the"
                        " pricelist of that cart."
                    ),
                }
            }

    # === CRUD METHODS === #

    def write(self, vals):
        res = super().write(vals)
        if {"country_id", "vat", "zip"} & vals.keys() and self:
            # Recompute fiscal position for open website orders
            order_fpos_recompute_domain = self._get_order_fiscal_position_recompute_domain()
            if orders_sudo := self.env["sale.order"].sudo().search(order_fpos_recompute_domain):
                orders_by_fpos = orders_sudo.grouped("fiscal_position_id")
                self.env.add_to_compute(orders_sudo._fields["fiscal_position_id"], orders_sudo)
                if fpos_changed := orders_sudo.filtered(
                    lambda so: so not in orders_by_fpos.get(so.fiscal_position_id, [])
                ):
                    fpos_changed._recompute_taxes()
                    # other modules may extend the orders to recompute for
                    # non-draft orders (for ex. sale_subscription), we need
                    # to ensure to only recompute prices for draft orders
                    fpos_changed.filtered(lambda order: order.state == "draft")._recompute_prices()
        return res

    def _get_order_fiscal_position_recompute_domain(self):
        """Return a domain of sale orders for which we should recompute fiscal position after address update."""
        return Domain([
            ("state", "=", "draft"),
            ("website_id", "!=", False),
            "|",
            ("partner_id", "in", self.ids),
            ("partner_shipping_id", "in", self.ids),
        ])

    # === ACTION METHODS === #

    def action_open_wishes(self):
        context = {}
        if len(self == 1):
            context["default_partner_id"] = self.id

        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Wishes"),
            "res_model": "product.wishlist",
            "views": [[False, "list"], [False, "form"]],
            "domain": [("partner_id", "in", self.ids)],
            "context": context,
        }

    # === BUSINESS METHODS === #

    def _get_current_partner(self, *, order_sudo=False, **kwargs):
        """Override `portal` to get current partner from order_sudo if user is not signed up."""
        if order_sudo:
            return (
                (not order_sudo._is_anonymous_cart() and order_sudo.partner_id)
                or self.env["res.partner"]  # Avoid returning public user's partner
            )
        return super()._get_current_partner(order_sudo=order_sudo, **kwargs)

    def _get_frontend_writable_fields(self):
        """Override `portal` to make website whitelist fields writable in portal address."""
        frontend_writable_fields = super()._get_frontend_writable_fields()
        frontend_writable_fields.update(
            self.env["ir.model"]._get("res.partner")._get_form_writable_fields().keys()
        )

        return frontend_writable_fields

    # FIXME VFE issue with assigning wishes to current partner is that if they finalize/drop their cart/session
    # they won't have their wishes anymore ?
    def _assign_session_wishes(self):
        """Assign all wishlist without partner from this the current session."""
        self.ensure_one()

        ProductWishlistSudo = self.env["product.wishlist"].sudo()

        session_wishes = ProductWishlistSudo.search([
            ("id", "in", request.session.get("wishlist_ids", [])),
            ("partner_id", "!=", self.id),
        ])
        if not session_wishes:
            return

        # TODO VFE what about multi-website here ?
        # Should we delete only conflicting ones in current website
        wished_products = ProductWishlistSudo.search([("partner_id", "=", self.id)]).product_id

        # Remove products already in the user wishlist
        duplicated_wishes = session_wishes.filtered(lambda wish: wish.product_id <= wished_products)
        session_wishes -= duplicated_wishes
        duplicated_wishes.unlink()

        # Assign the rest to the user
        session_wishes.partner_id = self.id
        request.session.pop("wishlist_ids")
