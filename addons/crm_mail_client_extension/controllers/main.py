# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import werkzeug

from odoo import http
from odoo.http import request
from odoo.tools.misc import formatLang
from odoo.addons.mail_client_extension.controllers.main import MailClientExtensionController
from odoo.tools import html2plaintext


_logger = logging.getLogger(__name__)


class MailClientExtensionController(MailClientExtensionController):

    @http.route(route='/mail_client_extension/log_single_mail_content',
                type="json", auth="outlook", cors="*")
    def log_single_mail_content(self, lead, message, **kw):
        """
            deprecated route, not needed for newer versions of the plugin but necessary
            for supporting older versions
        """
        crm_lead = request.env['crm.lead'].browse(lead)
        crm_lead.message_post(body=message)

    @http.route('/mail_client_extension/lead/get_by_partner_id', type="json", auth="outlook", cors="*")
    def crm_lead_get_by_partner_id(self, partner, limit=5, offset=0, **kwargs):
        """
            deprecated route, not needed for newer versions of the plugin but necessary
            for supporting older versions
        """
        return {'leads': self._get_leads(partner, limit, offset)}

    @http.route('/mail_client_extension/lead/create_from_partner', type='http', auth='user', methods=['GET'])
    def crm_lead_redirect_create_form_view(self, partner_id):
        """
            deprecated route, not needed for newer versions of the plugin but necessary
            for supporting older versions
        """
        server_action = http.request.env.ref("crm_mail_client_extension.lead_creation_prefilled_action")
        return werkzeug.utils.redirect('/web#action=%s&model=crm.lead&partner_id=%s' % (server_action.id, int(partner_id)))

    def _get_leads(self, partner, limit=5, offset=0):

        leads = []

        if partner and partner > 0:
            partner_leads = request.env['crm.lead'].search([('partner_id', '=', partner)],
                                                           offset=offset, limit=limit)
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

        return leads

    def _get_partner_extra_info(self, partner_id):
        extra_info = super(MailClientExtensionController, self)._get_partner_extra_info(partner_id)
        extra_info['leads'] = self._get_leads(partner_id)
        return extra_info

    def _get_loggable_modules(self):
        loggable_modules = super(MailClientExtensionController, self)._get_loggable_modules()
        loggable_modules.append('crm.lead')
        return loggable_modules

    @http.route('/mail_client_extension/lead/create_from_email', type='json', auth='outlook',
                cors="*")
    def create_lead_from_email(self, partner_id, email_body):
        record = request.env['crm.lead'].create(
            {'name': 'Lead from email', 'partner_id': partner_id,
             'description': html2plaintext(email_body)}
        )

        return {'created_id': record.id}
