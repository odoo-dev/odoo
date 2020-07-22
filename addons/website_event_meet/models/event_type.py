# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class EventType(models.Model):
    _inherit = "event.type"

    meeting_room_menu = fields.Boolean("Website Meeting Room", help="Display community tab on website")
    meeting_room_allow_creation = fields.Boolean("Allow meeting room creation", default=True, help="Let Visitors Create Rooms")
