# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import api, fields, models


class ProductNutritionalInfo(models.Model):
    _name = 'product.nutritional.info'

    product_id = fields.Many2one('product.template')
    group = fields.Selection(
        [
            ('servings', 'Servings'),
            ('nutrition', 'Nutrition'),
            ('nutrition_info', 'Nutritional Info'),
            ('additional_info', 'Additional Info'),
            ('deposit', 'Deposit'),
        ],
        string='Group',
        required=True,
    )
    key = fields.Many2one(
        'product.nutritional.info.key',
        string='Key',
        domain="[('group_name', '=', group)]",
        context="{'default_group_name': group}",
        required=True,
    )
    value = fields.Char(string='Value', required=True)


class ProductNutritionalInfoKey(models.Model):
    _name = 'product.nutritional.info.key'
    _description = 'dynamic keys for selection of product nutritional info'

    group_name = fields.Char(string='Group', required=True)
    key_name = fields.Char(string='Technical Key', required=True, copy=False)
    name = fields.Char(string='Name', required=True)

    _group_key_uniq = models.Constraint(
        'unique(group_name, key_name)',
        'A key with this name already exists in this group.',
    )

    @api.model
    def name_create(self, name):
        group_name = self.env.context.get('default_group_name')
        vals = {
            'name': name,
            'key_name': self._slugify(name),
        }
        if group_name:
            vals['group_name'] = group_name
        record = self.create(vals)
        return record.id, record.display_name

    @staticmethod
    def _slugify(name):
        """
        Convert a human-readable name into a technical snake_case key.

        'Serve Range Max' -> 'serve_range_max'
        'Caffeine (mg)'   -> 'caffeine_mg'
        'Trans Fat (mg)'  -> 'trans_fat_mg'
        """
        key = name.strip().lower()
        key = re.sub(r'[^a-z0-9]+', '_', key)
        key = re.sub(r'_+', '_', key).strip('_')
        return key
