# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class Track(models.Model):
    """ Decorated Many2Many between event.track and res.partner to keep wishlisted
    track and points gained on potential quizzes on tracks. """
    _name = 'event.track.partner'
    _description = 'Link a track and a customer'
    _table = 'event_track_partner'
    _rec_name = 'partner_id'
    _order = 'track_id'

    partner_id = fields.Many2one(
        'res.partner', string='Partner',
        index=True, required=True, ondelete='cascade')
    track_id = fields.Many2one(
        'event.track', string='Track',
        index=True, required=True, ondelete='cascade')
    is_wishlisted = fields.Boolean(string="Is Wishlisted")
