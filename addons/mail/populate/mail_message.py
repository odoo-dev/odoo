# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools import populate


class Message(models.Model):
    _inherit = "mail.message"
    _populate_dependencies = ["res.partner", "res.users"]

    _populate_sizes = {
        'small': 1e4,
        'medium': 1e7,
        'large': 1.5e8,
    }

    def _populate_factories(self):
        partner_ids = self.env.registry.populated_models['res.partner']

        def get_res_id(values, counter, random):
            model = values['model']
            if model:
                return random.choice(partner_ids)
            return False

        return [
            ('author_id', populate.randomize(partner_ids)),
            ('body', populate.constant('<p>Message {counter}</p>')),
            ('model', populate.randomize(['res.partner', False], [0.1, 0.9])),
            ('res_id', populate.compute(get_res_id)),
        ]
