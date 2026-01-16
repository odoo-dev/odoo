# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo import api, fields, models
from odoo.fields import Domain
from odoo.http import request


class ProductWishlist(models.Model):
    _name = "product.wishlist"
    _description = "Product Wishlist"
    _product_unique_partner_id = models.Constraint(
        "UNIQUE(product_id, partner_id, website_id)",
        "Duplicated wishlisted product for this partner.",
    )

    partner_id = fields.Many2one(string="Owner", comodel_name="res.partner", index="btree_not_null")
    product_id = fields.Many2one(comodel_name="product.product", required=True)
    website_id = fields.Many2one(comodel_name="website", ondelete="cascade", required=True)
    company_id = fields.Many2one(related="website_id.company_id")

    # The following fields are currently unused.
    # Nevertheless, they are kept for backward compatibility and for custom modules
    # as some users might want to display the price difference to encourage sales.
    price = fields.Float(
        string="Price",
        help="Price of the product when added to the wishlist",
        digits="Product Price",
    )
    currency_id = fields.Many2one(comodel_name="res.currency", compute="_compute_currency_id")
    pricelist_id = fields.Many2one(
        help="Pricelist when added to the wishlist", comodel_name="product.pricelist"
    )

    # === COMPUTE METHODS === #

    @api.depends("pricelist_id", "website_id")
    def _compute_currency_id(self):
        for wish in self:
            wish.currency_id = (
                wish.pricelist_id.currency_id or wish.website_id.company_id.currency_id.id
            )

    # === BUSINESS METHODS === #

    def _get_wishes_domain(self):
        if not request:
            return Domain(False)

        if partner := self.env["res.partner"]._get_current_partner(order_sudo=request.cart):
            user_domain = [("partner_id", "=", partner.id)]
        elif wish_ids := request.session.get("wishlist_ids", []):
            user_domain = [("id", "in", wish_ids)]
        else:
            user_domain = Domain(False)

        product_domain = [("active", "=", True)]
        if not self.env.user.has_group("base.group_system"):
            product_domain = Domain.AND([
                product_domain,
                [("product_tmpl_id.is_published", "=", True)],
            ])

        return Domain.AND([
            user_domain,
            [("website_id", "=", request.website.id), ("product_id", "any", product_domain)],
        ])

    @api.model
    def _get_wishes(self):
        return self.sudo().search(self._get_wishes_domain())

    @api.model
    def _get_wished_product_ids(self):
        """Return the `product.product` ids in wishlist.

        This method doesn't filter out products that are not valid anymore
        (archived, unpublished, not sale_ok anymore ...)
        """
        return self.sudo()._read_group(
            self._get_wishes_domain(), aggregates=["product_id:array_agg"]
        )[0][0]

    @api.model
    def _get_wished_template_ids(self):
        """Return the `product.template` ids in wishlist.

        This method doesn't filter out products that are not valid anymore
        (archived, unpublished, not sale_ok anymore ...)
        """
        domain = self._get_wishes_domain()
        if domain.is_false():
            return []
        wishes = self.sudo()._search(domain)
        return (
            self
            .env["product.template"]
            .sudo()
            ._search([("product_variant_ids", "any", wishes.subselect("product_id"))])
        )

    def _get_wishlist_count(self):
        return self.sudo().search_count(self._get_wishes_domain())

    @api.autovacuum
    def _gc_sessions(self, *_args, **kwargs):
        """Remove wishlists for unexisting sessions."""
        self.with_context(active_test=False).search([
            (
                "create_date",
                "<",
                fields.Datetime.to_string(
                    datetime.now() - timedelta(weeks=kwargs.get("wishlist_week", 5))
                ),
            ),
            ("partner_id", "=", False),
        ]).unlink()
