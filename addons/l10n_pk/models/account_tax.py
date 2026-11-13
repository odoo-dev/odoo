from odoo import api, fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_pk_is_further_tax = fields.Boolean(
        string="Is Further Tax",
        help="This field is used in the Pakistan e-invoicing or e-receipt integration",
    )

    @api.model
    def _eval_taxes_computation_prepare_values(self, default_values, record=None):
        # Some callers (e.g. product.template._construct_tax_string) pass a product.template
        # instead of the documented product.product record. Fall back to its variant so
        # variant-only fields referenced in custom tax formulas (e.g. lst_price) still resolve.
        if record and record._name == 'product.template':
            variant_only_fields = set(default_values) - set(record._fields)
            if variant_only_fields:
                record = record.product_variant_id or record
        return super()._eval_taxes_computation_prepare_values(default_values, record=record)
