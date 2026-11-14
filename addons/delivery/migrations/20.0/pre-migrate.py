# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tools.sql import column_exists


def migrate(cr, version):
    """Keep the products that backed the delivery methods.

    The products and the "Deliveries" category are no longer declared in the data files. Flag
    their external ids as `noupdate` so the end of the update does not try to delete them: past
    sale order lines still use them. They are archived in `end-migrate`.
    """
    cr.execute("""
        UPDATE ir_model_data
           SET noupdate = TRUE
         WHERE module = 'delivery'
           AND name = 'product_category_deliveries'
    """)
    if not column_exists(cr, "delivery_carrier", "product_id"):
        return
    # The column outlives its field until `end-migrate`: carriers created meanwhile have no product.
    cr.execute("ALTER TABLE delivery_carrier ALTER COLUMN product_id DROP NOT NULL")
    cr.execute("""
        UPDATE ir_model_data imd
           SET noupdate = TRUE
          FROM delivery_carrier carrier
          JOIN product_product product ON product.id = carrier.product_id
         WHERE (imd.model = 'product.product' AND imd.res_id = product.id)
            OR (imd.model = 'product.template' AND imd.res_id = product.product_tmpl_id)
    """)
