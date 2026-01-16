# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import Controller, request, route
from odoo.http.session import touch


class ProductWishlist(Controller):

    @route("/shop/wishlist/add", type="jsonrpc", auth="public", website=True)
    def add_to_wishlist(self, product_id, **_kwargs):
        product = request.env["product.product"].browse(product_id)

        price = product._get_combination_info_variant()["price"]

        Wishlist = request.env["product.wishlist"].sudo()
        partner = request.env["res.partner"]._get_current_partner(order_sudo=request.cart)

        wish = Wishlist.create({
            "partner_id": partner.id,
            "product_id": product_id,
            "currency_id": request.website.currency_id,
            "pricelist_id": request.pricelist.id,
            "price": price,
            "website_id": request.website.id,
        })

        if not partner:
            request.session["wishlist_ids"] = request.session.get("wishlist_ids", []) + [wish.id]

        return wish

    @route("/shop/wishlist", type="http", auth="public", website=True, readonly=True, sitemap=False)
    def shop_wishlist(self, **_kwargs):
        wishes_sudo = request.env["product.wishlist"]._get_wishes()

        return request.render(
            "website_sale.product_wishlist",
            {"wishes": wishes_sudo.with_context(display_default_code=False)},
        )

    @route("/shop/wishlist/remove/<int:wish_id>", type="jsonrpc", auth="public", website=True)
    def remove_from_wishlist(self, wish_id, **_kwargs):
        wish = request.env["product.wishlist"].browse(wish_id)
        if request.website.is_public_user():
            wish_ids = request.session.get("wishlist_ids") or []
            if wish_id in wish_ids:
                request.session["wishlist_ids"].remove(wish_id)
                touch(request.session)
                wish.sudo().unlink()
        else:
            wish.unlink()
        return True

    @route(
        "/shop/wishlist/get_product_ids", type="jsonrpc", auth="public", website=True, readonly=True
    )
    def shop_wishlist_get_product_ids(self):
        return request.env["product.wishlist"]._get_wished_product_ids()
