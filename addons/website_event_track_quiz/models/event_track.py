# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.http import request


class EventTrack(models.Model):
    _name = "event.track"
    _inherit = ['event.track']

    quiz_id = fields.Many2one('event.quiz', string="Quiz")
    quiz_questions_count = fields.Integer(string="Numbers of Questions", compute='_compute_questions_count')

    @api.depends('quiz_id.question_ids')
    def _compute_questions_count(self):
        for track in self:
            track.quiz_questions_count = len(track.quiz_id.question_ids)

    def _find_track_visitor(self, force_create=False):
        """
        This method retrieves or create the track_visitor linked to the given track and the current visitor.
        :param force_create: If True, force the creation a track_visitor AND a visitor if they do not exist yet.
        :return: event.track.visitor browser record, website.visitor browse record
        """
        self.ensure_one()
        track_visitor = request.env['event.track.visitor']
        user = request.env.user
        visitor = request.env['website.visitor']._get_visitor_from_request(force_create=force_create)

        if not user._is_public():
            track_visitor = self.env['event.track.visitor'].sudo().search([('track_id', '=', self.id), ('partner_id', '=', user.partner_id.id)], limit=1)
        elif visitor:
            track_visitor = self.env['event.track.visitor'].sudo().search([('track_id', '=', self.id), ('visitor_id', '=', visitor.id)], limit=1)
        if visitor and force_create and not track_visitor:
            values = {
                'visitor_id': visitor.id,
                'quiz_completed': False,
                'quiz_points': 0,
                'track_id': self.id
            }
            return request.env['event.track.visitor'].sudo().create(values), visitor
        return track_visitor, visitor
