# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tools.sql import column_exists


def migrate(cr, version):
    """Copy the description of the delivery products to their delivery methods.

    `delivery.carrier.website_description` used to be related to the sale description of the
    delivery product. Translations are copied along, both fields being translatable (jsonb).
    The old `product_id` column is dropped by the `end-migrate` script of `delivery`.
    """
    if not column_exists(cr, "delivery_carrier", "product_id"):
        return
    cr.execute("""
        UPDATE delivery_carrier carrier
           SET website_description = tmpl.description_sale
          FROM product_product product
          JOIN product_template tmpl ON tmpl.id = product.product_tmpl_id
         WHERE product.id = carrier.product_id
           AND carrier.website_description IS NULL
    """)
