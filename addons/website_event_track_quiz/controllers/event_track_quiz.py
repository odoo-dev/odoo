# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import math

from odoo import http
from odoo.addons.website_event_track_session.controllers.session import WebsiteEventSessionController
from odoo.exceptions import AccessError, UserError
from odoo.http import request
from odoo.osv import expression
from odoo.addons.http_routing.models.ir_http import slug


class WebsiteEventTrackQuiz(WebsiteEventSessionController):

    # ------------------------------------------------------------
    # PAGE VIEW
    # ------------------------------------------------------------

    def _event_track_page_get_values(self, event, track, **options):
        values = super(WebsiteEventTrackQuiz, self)._event_track_page_get_values(event, track)
        track_visitor = track._get_event_track_visitors(force_create=True)
        values.update({
            'track_visitor': track_visitor,
            'is_manager': request.env.user.has_group('event.group_event_manager')
        })
        return values

    # QUIZZES IN PAGE
    # ----------------------------------------------------------

    @http.route('/event_track/quiz/submit', type="json", auth="public", website=True)
    def event_track_quiz_submit(self, event_id, track_id, answer_ids):
        track = self._fetch_track(track_id)

        event_track_visitor = track._get_event_track_visitors(force_create=True)
        visitor_sudo = event_track_visitor.visitor_id
        if event_track_visitor.quiz_completed:
            return {'error': 'track_quiz_done'}

        answers_details = self._get_quiz_answers_details(track, answer_ids)

        event_track_visitor.write({
            'quiz_completed': True,
            'quiz_points': answers_details['points'],
        })

        result = {
            'answers': {
                answer.question_id.id: {
                    'is_correct': answer.is_correct,
                    'comment': answer.comment
                } for answer in answers_details['user_answers']
            },
            'quiz_completed': event_track_visitor.quiz_completed,
            'quiz_points': answers_details['points']
        }
        if visitor_sudo and request.httprequest.cookies.get('visitor_uuid', '') != visitor_sudo.access_token:
            result['visitor_uuid'] = visitor_sudo.access_token
        return result

    @http.route('/event_track/quiz/reset', type="json", auth="user", website=True)
    def quiz_reset(self, event_id, track_id):
        track = self._fetch_track(track_id)

        event_track_visitor = track._get_event_track_visitors(force_create=True)
        event_track_visitor.write({
            'quiz_completed': False,
            'quiz_points': 0,
        })

    @http.route(['/event_track/quiz/save'], type='json', auth='public', website=True)
    def quiz_save_to_session(self, quiz_answers):
        session_quiz_answers = json.loads(request.session.get('quiz_answers', '{}'))
        track_id = quiz_answers['track_id']
        session_quiz_answers[str(track_id)] = quiz_answers['quiz_answers']
        request.session['quiz_answers'] = json.dumps(session_quiz_answers)

    def _get_quiz_answers_details(self, track, answer_ids):
        all_questions = request.env['event.quiz.question'].sudo().search([('quiz_id', '=', track.sudo().quiz_id.id)])
        user_answers = request.env['event.quiz.answer'].sudo().search([('id', 'in', answer_ids)])

        if user_answers.mapped('question_id') != all_questions:
            return {'error': 'quiz_incomplete'}

        user_bad_answers = user_answers.filtered(lambda answer: not answer.is_correct)
        user_good_answers = user_answers - user_bad_answers
        return {
            'user_bad_answers': user_bad_answers,
            'user_good_answers': user_good_answers,
            'user_answers': user_answers,
            'points': sum([answer.awarded_points for answer in user_good_answers])
        }
