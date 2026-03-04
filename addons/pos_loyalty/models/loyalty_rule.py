# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.fields import Domain


class LoyaltyRule(models.Model):
    _name = 'loyalty.rule'
    _inherit = ['loyalty.rule', 'pos.load.mixin']

    valid_product_ids = fields.Many2many(
        'product.product', "Valid Products", compute='_compute_valid_product_ids',
        help="These are the products that are valid for this rule.")
    any_product = fields.Boolean(
        compute='_compute_valid_product_ids', help="Technical field, whether all product match")

    promo_barcode = fields.Char("Barcode", compute='_compute_promo_barcode', store=True, readonly=False,
        help="A technical field used as an alternative to the promo code. "
        "This is automatically generated when the promo code is changed."
    )

    @api.model
    def _load_pos_data_domain(self, data, config):
        return [('program_id', 'in', config._get_program_ids().ids)]

    @api.model
    def _load_pos_data_fields(self, config):
        return ['program_id', 'valid_product_ids', 'any_product', 'currency_id',
            'reward_point_amount', 'reward_point_split', 'reward_point_mode',
            'minimum_qty', 'minimum_amount', 'minimum_amount_tax_mode', 'mode', 'code']

    @api.depends('product_ids', 'product_category_id', 'product_tag_id', 'product_domain')  # TODO later: product tags
    def _compute_valid_product_ids(self):
        # Prefetch Many2many relations to avoid N+1 queries during grouping
        self.mapped('product_ids')

        # Define a helper to generate a unique key based on the rule's product filters
        def get_filter_key(rule):
            # Normalizing the domain to avoid redundant searches for equivalent empty domains
            normalized_domain = rule.product_domain if rule.product_domain not in ('[]', "[['sale_ok', '=', True]]") else False
            return (
                tuple(rule.product_ids.ids),
                rule.product_category_id.id,
                rule.product_tag_id.id,
                normalized_domain,
            )

        for key, rules in self.grouped(get_filter_key).items():
            if not any(key):
                # No filters defined: the rule applies to any product
                rules.update({'valid_product_ids': [(5, 0, 0)], 'any_product': True})
                continue

            # At least one filter is defined: search for matching products available in POS
            domain = Domain.AND([[('available_in_pos', '=', True)], rules[0]._get_valid_product_domain()])
            valid_products = self.env['product.product'].search(domain, order="id")
            rules.update({
                'valid_product_ids': [(6, 0, valid_products.ids)],
                'any_product': False,
            })

    @api.depends('code')
    def _compute_promo_barcode(self):
        for rule in self:
            rule.promo_barcode = self.env['loyalty.card']._generate_code()
