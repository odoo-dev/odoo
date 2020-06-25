# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools.translate import _


class Track(models.Model):
    _name = "event.track"
    _inherit = ['event.track']

    event_track_partner_ids = fields.One2many(
        'event.track.partner', 'track_id', depends=['partner_ids'])
    partner_ids = fields.Many2many(
        'res.partner', 'event_track_partner', 'track_id', 'partner_id',
        string='Track Participants', copy=False, depends=['event_track_partner_ids'])
    wishlist_partner_ids = fields.Many2many('res.partner', string="Wishlisted By", compute="_compute_wishlist_track_partners")
    wishlist_partner_count = fields.Integer(string="#Wishlisted", compute="_compute_wishlist_track_partners")
    wishlisted_by_default = fields.Boolean(
        string='Wishlisted by default',
        help="""If set, the talk will be starred for each attendee registered to the event. The attendee won't be able to un-star this talk.""")

    @api.depends('partner_ids')
    def _compute_wishlist_track_partners(self):
        results = self.env['event.track.partner'].sudo().read_group(
            [('track_id', 'in', self.ids), ('is_wishlisted', '=', True)],
            ['track_id', 'partner_id:array_agg'],
            ['track_id']
        )
        partner_ids_map = {result['track_id'][0]: result['partner_id'] for result in results}
        for track in self:
            track.wishlist_partner_ids = partner_ids_map.get(track.id, [])
            track.wishlist_partner_count = len(partner_ids_map.get(track.id, []))

    def action_view_wishlist_partners(self):
        if not self.wishlist_partner_ids:
            return False
        action = self.env.ref('website_event_track_online.res_partner_action_from_track').read()[0]
        action.update({
            'display_name': _('Wishlisters of %s') % (self.name),
            'domain': [('id', 'in', self.wishlist_partner_ids.ids)]
        })
        return action

    def _find_event_track_partner(self, partner_id, force_create=False):
        self.ensure_one()

        event_track_partner = self.env['event.track.partner'].sudo().search(
            [('partner_id', '=', partner_id), ('track_id', '=', self.id)]
        )
        if not event_track_partner and force_create:
            event_track_partner = self.env['event.track.partner'].sudo().create({
                'partner_id': partner_id,
                'track_id': self.id
            })
        return event_track_partner
