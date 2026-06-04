# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api
from odoo.fields import Domain

import ast
import json


class LoyaltyReward(models.Model):
    _name = 'loyalty.reward'
    _inherit = ['loyalty.reward', 'pos.load.mixin']

    def _get_discount_product_values(self):
        res = super()._get_discount_product_values()
        for vals in res:
            vals.update({'taxes_id': False})
        return res

    @api.model
    def _load_pos_data_domain(self, data, config):
        reward_product_tag_domain = [
            ('reward_product_tag_id', '!=', False),
            '|',
            ('reward_product_tag_id.product_template_ids.active', '=', True),
            ('reward_product_tag_id.product_product_ids.active', '=', True),
        ]
        return Domain.AND([
            [('program_id', 'in', config._get_program_ids().ids)],
            Domain.OR([
                [('reward_type', '!=', 'product')],
                [('reward_product_id.active', '=', True)],
                reward_product_tag_domain,
            ]),
        ])

    @api.model
    def _load_pos_data_fields(self, config):
        return ['description', 'program_id', 'reward_type', 'required_points', 'clear_wallet', 'currency_id',
                'discount', 'discount_mode', 'discount_applicability', 'all_discount_product_ids', 'is_global_discount',
                'discount_max_amount', 'discount_line_product_id', 'reward_product_id',
                'multi_product', 'reward_product_ids', 'reward_product_qty', 'reward_product_uom_id', 'reward_product_domain']

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        self._replace_ilike_with_in(read_records)
        return read_records

    def _replace_ilike_with_in(self, read_records):
        """ Replace the `ilike` conditions of the reward domains by the matching ids.

        The searches are resolved once per (comodel, value) pair for the whole batch: the
        same condition is usually repeated across the rewards of a program, and each one
        used to trigger its own search.
        """
        searches = set()
        parsed_rewards = []
        for reward in read_records:
            domain_str = reward['reward_product_domain']
            if domain_str == "null":
                continue

            domain = json.loads(domain_str)
            conditions = []
            for index, condition in self._parse_domain(domain).items():
                field_name, operator, value = condition
                field = self.env['product.product']._fields.get(field_name)

                if field and field.type in ['many2one', 'many2many'] and operator in ('ilike', 'not ilike'):
                    conditions.append((index, field_name, operator, value, field.comodel_name))
                    searches.add((field.comodel_name, value))
            parsed_rewards.append((reward, domain, conditions))

        matching_ids = {
            (comodel_name, value): list(self.env[comodel_name]._search([('display_name', 'ilike', value)]))
            for comodel_name, value in searches
        }

        for reward, domain, conditions in parsed_rewards:
            for index, field_name, operator, value, comodel_name in conditions:
                new_operator = 'in' if operator == 'ilike' else 'not in'
                domain[index] = [field_name, new_operator, matching_ids[comodel_name, value]]
            reward['reward_product_domain'] = json.dumps(domain)

    def _get_reward_product_domain_fields(self, config):
        fields = set()
        search_domain = [('program_id', 'in', config._get_program_ids().ids)]
        domains = self.search_read(search_domain, fields=['reward_product_domain'], load=False)
        for domain in filter(lambda d: d['reward_product_domain'] != "null", domains):
            domain = json.loads(domain['reward_product_domain'])
            for condition in self._parse_domain(domain).values():
                field_name, _, _ = condition
                fields.add(field_name)
        return fields

    def _parse_domain(self, domain):
        parsed_domain = {}
        for index, condition in enumerate(domain):
            if isinstance(condition, (list, tuple)) and len(condition) == 3:
                parsed_domain[index] = condition
        return parsed_domain

    def unlink(self):
        if len(self) == 1 and self.env['pos.order.line'].sudo().search_count([('reward_id', 'in', self.ids)], limit=1):
            return self.action_archive()
        return super().unlink()
