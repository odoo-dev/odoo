# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields


class Partner(models.Model):
    _name = 'res.partner'
    _inherit = ['res.partner']

    event_track_partner_ids = fields.One2many(
        'event.track.partner', 'partner_id', depends=['event_track_ids'])
    event_track_ids = fields.Many2many(
        'event.track', 'event_track_partner', 'partner_id', 'track_id',
        string='Sessions Participations', copy=False, depends=['event_track_partner_ids'])
