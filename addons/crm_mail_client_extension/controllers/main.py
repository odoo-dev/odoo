# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import werkzeug

from odoo import http
from odoo.http import request
from odoo.tools.misc import formatLang

_logger = logging.getLogger(__name__)


class MailClientExtensionController(http.Controller):

    #log_single_mail_content route is in routes for maintaining the legacy version
    # of the plugin which relies on it
    @http.route(route=['/mail_client_extension/lead/log_mail_content',
                       '/mail_client_extension/log_single_mail_content'],
                type="json", auth="outlook", cors="*")
    def log_single_mail_content(self, lead, message, **kw):
        crm_lead = request.env['crm.lead'].browse(lead)
        crm_lead.message_post(body=message)

    @http.route('/mail_client_extension/lead/get_by_partner_id', type="json", auth="outlook", cors="*")
    def crm_lead_get_by_partner_id(self, partner, limit=1000, offset=0, **kwargs):
        partner_leads = request.env['crm.lead'].search([('partner_id', '=', partner)], offset=offset, limit=limit)
        leads = []

        recurring_revenues = request.env.user.has_group('crm.group_use_recurring_revenues')

        for lead in partner_leads:
            lead_values = {
                'id': lead.id,
                'name': lead.name,
                'expected_revenue': formatLang(request.env, lead.expected_revenue, monetary=True,
                                               currency_obj=lead.company_currency),
                'probability': lead.probability,
            }

            if recurring_revenues:
                lead_values.update({
                    'recurring_revenue': formatLang(request.env, lead.recurring_revenue, monetary=True,
                                                    currency_obj=lead.company_currency),
                    'recurring_plan': lead.recurring_plan.name,
                })

            leads.append(lead_values)

        return {'leads': leads}

    @http.route('/mail_client_extension/lead/view', type='http', auth='user', methods=['GET'])
    def crm_lead_redirect_form_view(self, lead_id):
        server_action = http.request.env.ref("crm_mail_client_extension.lead_view")
        return werkzeug.utils.redirect(
            '/web#action=%s&model=crm.lead&id=%s' % (server_action.id, int(lead_id)))

    @http.route('/mail_client_extension/lead/create_from_partner', type='http', auth='user', methods=['GET'])
    def crm_lead_redirect_create_form_view(self, partner_id):
        server_action = http.request.env.ref("crm_mail_client_extension.lead_creation_prefilled_action")
        return werkzeug.utils.redirect('/web#action=%s&model=crm.lead&partner_id=%s' % (server_action.id, int(partner_id)))
