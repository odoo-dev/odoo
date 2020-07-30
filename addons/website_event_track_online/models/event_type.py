# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventType(models.Model):
    _inherit = "event.type"

    community_menu = fields.Boolean(
        "Community Menu", compute="_compute_community_menu",
        readonly=False, store=True,
        help="Display community tab on website")

    @api.depends('website_menu')
    def _compute_community_menu(self):
        # TDE FIXME: check true by default
        for event_type in self:
            event_type.community_menu = False
