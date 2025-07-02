# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta
from dateutil.relativedelta import relativedelta

from odoo import _, fields, http
from odoo.http import request
from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.addons.survey.controllers.main import Survey


class SaveSurvey(Survey):

    @http.route('/survey/save/<string:survey_token>/<string:answer_token>', type='json', auth='public', website=True)
    def survey_save(self, survey_token, answer_token, **post):
        access_data = self._get_access_data(survey_token, answer_token)
        if access_data['validity_code'] is not True:
            return {}, {'error': access_data['validity_code']}
        survey_sudo, answer_sudo = access_data['survey_sudo'], access_data['answer_sudo']

        if answer_sudo.state == 'done':
            return {}, {'error': 'unauthorized'}

        questions, page_or_question_id = survey_sudo._get_survey_questions(answer=answer_sudo,
                                                                           page_id=post.get('page_id'),
                                                                           question_id=post.get('question_id'))

        if not answer_sudo.test_entry and not survey_sudo._has_attempts_left(answer_sudo.partner_id, answer_sudo.email, answer_sudo.invite_token):
            return {}, {'error': 'unauthorized'}

        if answer_sudo.survey_time_limit_reached or answer_sudo.question_time_limit_reached:
            if answer_sudo.question_time_limit_reached:
                time_limit = survey_sudo.session_question_start_time + relativedelta(
                    seconds=survey_sudo.session_question_id.time_limit
                )
                time_limit += timedelta(seconds=3)
            else:
                time_limit = answer_sudo.start_datetime + timedelta(minutes=survey_sudo.time_limit)
                time_limit += timedelta(seconds=10)
            if fields.Datetime.now() > time_limit:
                return {}, {'error': 'unauthorized'}

        errors = {}
        for question in questions:
            inactive_questions = request.env['survey.question'] if answer_sudo.is_session_answer else answer_sudo._get_inactive_conditional_questions()
            if question in inactive_questions:
                continue
            answer, comment = self._extract_comment_from_answers(question, post.get(str(question.id)))
            errors.update(question.validate_question(answer, comment))
            if not errors.get(question.id):
                answer_sudo._save_lines(question, answer, comment, overwrite_existing=True)

        if errors and not (answer_sudo.survey_time_limit_reached or answer_sudo.question_time_limit_reached):
            return {}, {'error': 'validation', 'fields': errors}


class PortalSurvey(CustomerPortal):

    @http.route('/my/surveys', type='http', auth='user', website=True)
    def portal_my_surveys(self, **kw):
        values = self._prepare_portal_layout_values()
        surveys = request.env['survey.user_input'].search(domain=[('partner_id', '=', request.env.user.partner_id.id)])
        values.update({'surveys': surveys})
        return request.render("save_survey.portal_my_surveys", values)

    def _prepare_home_portal_values(self, counters):
        values = super()._prepare_home_portal_values(counters)
        if 'survey_count' in counters:
            values['survey_count'] = request.env['survey.user_input'].search_count([('partner_id', '=', request.env.user.partner_id.id)])
        return values
