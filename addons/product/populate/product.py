# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import collections

from odoo import models
from odoo.tools import populate
from odoo.addons.stock.populate.stock import COMPANY_NB_WITH_STOCK

_logger = logging.getLogger(__name__)


class ProductCategory(models.Model):
    _inherit = "product.category"
    _populate_sizes = {"small": 50, "medium": 500, "large": 30000}

    def _populate_factories(self):
        # quid of parent_id ???

        return [("name", populate.constant('product_vcategory_{counter}'))]

    def _populate(self, size):
        categories = super()._populate(size)
        # set parent_ids
        self._populate_set_parents(categories, size)
        return categories

    def _populate_set_parents(self, categories, size):
        _logger.info('Setting parent categories')
        parents = self.env["product.category"]
        rand = populate.Random('product.product+parent_generator')
        for category in categories:
            if not rand.getrandbits(4):
                parents |= category
        parent_ids = parents.ids
        categories -= parents  # Avoid recursion in parent-child relations.
        parent_childs = collections.defaultdict(lambda: self.env['product.category'])
        for count, category in enumerate(categories):
            if not rand.getrandbits(2):  # 1/4 of remaining categories have a parent.
                parent_childs[rand.choice(parent_ids)] |= category

        for count, (parent, children) in enumerate(parent_childs.items()):
            if (count + 1) % 100 == 0:
                _logger.info('Setting parent: %s/%s', count + 1, len(parents))
            children.write({'parent_id': parent})

class ProductProduct(models.Model):
    _inherit = "product.product"
    _populate_sizes = {"small": 150, "medium": 5000, "large": 60000}
    _populate_dependencies = ["product.category"]

    def _populate_get_types(self):
        return ["consu", "service"], [2, 1]

    def _populate_factories(self):
        category_ids = self.env.registry.populated_models["product.category"]
        types, types_distribution = self._populate_get_types()

        def get_rand_float(values, counter, random):
            return random.randrange(0, 1500) * random.random()

        return [
            ("name", populate.constant('product_product_name_{counter}')),
            ("sequence", populate.randomize([False] + [i for i in range(1, 101)])),
            ("description", populate.constant('product_template_description_{counter}')),
            ("default_code", populate.constant('product_default_code_{counter}')),
            ("barcode", populate.constant('barcode-{counter}')),
            ("active", populate.randomize([True, False], [0.8, 0.2])),
            ("type", populate.randomize(types, types_distribution)),
            ("categ_id", populate.randomize(category_ids)),
            ("lst_price", populate.compute(get_rand_float)),
            ("standard_price", populate.compute(get_rand_float)),
        ]


class SupplierInfo(models.Model):
    _inherit = 'product.supplierinfo'

    _populate_sizes = {'small': 450, 'medium': 15_000, 'large': 180_000}
    _populate_dependencies = ['res.partner']

    def _populate_factories(self):
        random = populate.Random('product_with_supplierinfo')
        company_ids = self.env.registry.populated_models['res.company'][:COMPANY_NB_WITH_STOCK] + [False]
        partner_ids = self.env.registry.populated_models['res.partner']
        product_templates_ids = self.env['product.product'].browse(self.env.registry.populated_models['product.product']).product_tmpl_id.ids
        product_templates_ids = random.sample(product_templates_ids, int(len(product_templates_ids) * 0.95))

        def get_company_id(values, counter, random):
            partner = self.env['res.partner'].browse(values['name'])
            if partner.company_id:
                return partner.company_id.id
            return random.choice(company_ids)

        def get_delay(values, counter, random):
            # 5 % with huge delay (between 5 month and 6 month), otherwise between 1 and 10 days
            if random.random() > 0.95:
                return random.randint(150, 210)
            return random.randint(1, 10)

        return [
            ('name', populate.randomize(partner_ids)),
            ('company_id', populate.compute(get_company_id)),
            ('product_tmpl_id', populate.iterate(product_templates_ids)),
            ('product_name', populate.constant("SI-{counter}")),
            ('sequence', populate.randint(1, 10)),
            ('min_qty', populate.randint(0, 10)),
            ('price', populate.randint(10, 100)),
            ('delay', populate.compute(get_delay)),
        ]
