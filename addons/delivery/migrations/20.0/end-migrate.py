# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import SUPERUSER_ID, api
from odoo.tools.sql import column_exists


def migrate(cr, version):
    """Archive the products that only backed delivery methods, then drop the old column.

    Runs once every module is updated, so that the other modules (e.g. `website_sale`) could read
    the products of the delivery methods during their own migration.
    """
    if not column_exists(cr, "delivery_carrier", "product_id"):
        return

    # Products still sold as regular products (not as shipping costs) are left active.
    cr.execute("""
        SELECT DISTINCT carrier.product_id
          FROM delivery_carrier carrier
         WHERE carrier.product_id IS NOT NULL
           AND NOT EXISTS (
                   SELECT 1
                     FROM sale_order_line line
                    WHERE line.product_id = carrier.product_id
                      AND line.is_delivery IS NOT TRUE
               )
    """)
    product_ids = [product_id for (product_id,) in cr.fetchall()]
    if product_ids:
        env = api.Environment(cr, SUPERUSER_ID, {"active_test": False})
        products = env["product.product"].browse(product_ids)
        templates = products.product_tmpl_id.filtered(
            lambda tmpl: tmpl.product_variant_ids <= products
        )
        templates.action_archive()
        (products - templates.product_variant_ids).action_archive()

    cr.execute("ALTER TABLE delivery_carrier DROP COLUMN product_id")
