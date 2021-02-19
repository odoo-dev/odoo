# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools import populate


class Channel(models.Model):
    _inherit = "mail.channel"

    _populate_sizes = {
        'small': 200,
        'medium': 1.105e5,
        'large': 1.51e6,
    }

    def get_channel_probability(self):
        return [0.05, 0.45, 0.5]

    def get_channel_type(self):
        return ['channel', 'chat', 'livechat']

    def _populate_factories(self):
        res = super(Channel, self)._populate_factories()

        partner_ids = self.env.registry.populated_models['res.partner']
        res.append(('livechat_operator_id', populate.randomize(partner_ids)))

        return res
