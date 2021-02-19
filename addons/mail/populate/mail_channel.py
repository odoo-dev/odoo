# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools import populate


class Channel(models.Model):
    _inherit = "mail.channel"
    _populate_dependencies = ["mail.message", "res.partner"]

    _populate_sizes = {
        'small': 100,
        'medium': 1.105e5,
        'large': 5.1e5,
    }

    def get_channel_probability(self):
        return [0.1, 0.9]

    def get_channel_type(self):
        return ['channel', 'chat']

    def _populate_factories(self):
        groups = self.env['res.groups']
        message_ids = self.env.registry.populated_models['mail.message']
        partner_ids = self.env.registry.populated_models['res.partner']
        self.message_ids = message_ids

        def get_channel_partner_ids(values, counter, random):
            return [random.sample(partner_ids, 2)]

        def get_group_ids(values, counter, random):
            return random.sample(groups.ids, int(len(groups.ids) * 0.2))

        def get_messages(values, counter, random):
            partner_ids = values['channel_partner_ids'][0]
            messages = self.env['mail.message'].browse(message_ids).filtered(lambda msg: msg.author_id.id in partner_ids)
            return messages.ids[:50]

        return [
            ('channel_partner_ids', populate.compute(get_channel_partner_ids)),
            ('channel_message_ids', populate.compute(get_messages)),
            ('channel_type', populate.randomize(self.get_channel_type(), self.get_channel_probability())),
            ('group_ids', populate.compute(get_group_ids)),
            ('name', populate.constant("channel - {counter}")),
            ('public', populate.randomize(
                ['public', 'private', 'groups'],
                [0.2, 0.3, 0.3],
            )),
        ]
