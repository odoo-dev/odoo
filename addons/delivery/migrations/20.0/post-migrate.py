# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tools.sql import column_exists


def migrate(cr, version):
    """Copy the accounting setup of the delivery products to their delivery methods.

    The `product_id` column of `delivery_carrier` is no longer managed by the ORM but is still
    there; it is dropped in `end-migrate`.
    """
    if not column_exists(cr, "delivery_carrier", "product_id"):
        return

    # Income and expense accounts. Both sides are company-dependent (jsonb, one value per company):
    # take the accounts of the product category, overridden by the ones of the product. Carriers
    # without a specific account fall back on the default accounts of the company.
    cr.execute("""
        UPDATE delivery_carrier carrier
           SET income_account_id = NULLIF(
                   COALESCE(categ.property_account_income_categ_id, '{}'::jsonb)
                   || COALESCE(tmpl.property_account_income_id, '{}'::jsonb),
                   '{}'::jsonb
               ),
               expense_account_id = NULLIF(
                   COALESCE(categ.property_account_expense_categ_id, '{}'::jsonb)
                   || COALESCE(tmpl.property_account_expense_id, '{}'::jsonb),
                   '{}'::jsonb
               )
          FROM product_product product
          JOIN product_template tmpl ON tmpl.id = product.product_tmpl_id
     LEFT JOIN product_category categ ON categ.id = tmpl.categ_id
         WHERE product.id = carrier.product_id
           AND carrier.income_account_id IS NULL
           AND carrier.expense_account_id IS NULL
    """)

    # Sales taxes.
    cr.execute("""
        INSERT INTO delivery_carrier_account_tax_rel (carrier_id, tax_id)
             SELECT carrier.id, rel.tax_id
               FROM delivery_carrier carrier
               JOIN product_product product ON product.id = carrier.product_id
               JOIN product_taxes_rel rel ON rel.prod_id = product.product_tmpl_id
        ON CONFLICT DO NOTHING
    """)
