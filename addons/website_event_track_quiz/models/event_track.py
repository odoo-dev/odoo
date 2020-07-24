# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventTrack(models.Model):
    _inherit = ['event.track']

    quiz_id = fields.Many2one('event.quiz', string="Quiz")
    quiz_questions_count = fields.Integer(string="# Quiz Questions", compute='_compute_quiz_questions_count')

    @api.depends('quiz_id.question_ids')
    def _compute_quiz_questions_count(self):
        for track in self:
            track.quiz_questions_count = len(track.quiz_id.question_ids)
