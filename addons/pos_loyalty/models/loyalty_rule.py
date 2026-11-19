# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.fields import Domain

import ast
from collections import defaultdict



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
        ProductProduct = self.env['product.product']
        tag_rules = self.filtered(lambda rule: (
            rule.product_tag_id
            and not rule.product_ids
            and not rule.product_category_id
            and rule.product_domain in (False, '', '[]', "[['sale_ok', '=', True]]")
        ))
        for product_domain, rules in tag_rules.grouped('product_domain').items():
            domain = Domain.AND([
                [('available_in_pos', '=', True), ('all_product_tag_ids', 'in', rules.product_tag_id.ids)],
                Domain(ast.literal_eval(product_domain)) if product_domain else Domain.TRUE,
            ])
            product_ids_by_tag = defaultdict(list)
            for product in ProductProduct.search(domain, order="id"):
                for tag_id in (product.product_tmpl_id.product_tag_ids | product.additional_product_tag_ids).ids:
                    product_ids_by_tag[tag_id].append(product.id)
            for rule in rules:
                rule.valid_product_ids = ProductProduct.browse(product_ids_by_tag[rule.product_tag_id.id])
                rule.any_product = False

        for key, rules in (self - tag_rules).grouped(lambda rule: (
            tuple(rule.product_ids.ids),
            rule.product_category_id.id,
            rule.product_tag_id.id,
            '' if rule.product_domain in ('[]', "[['sale_ok', '=', True]]") else rule.product_domain,
        )).items():
            if any(key):
                domain = Domain.AND([[('available_in_pos', '=', True)], rules[:1]._get_valid_product_domain()])
                rules.valid_product_ids = self.env['product.product'].search(domain, order="id")
                rules.any_product = False
            else:
                rules.valid_product_ids = self.env['product.product']
                rules.any_product = True

    @api.depends('code')
    def _compute_promo_barcode(self):
        for rule in self:
            rule.promo_barcode = self.env['loyalty.card']._generate_code()
