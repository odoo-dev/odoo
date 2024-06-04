# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup
from odoo import fields, models, _, tools


class MassMailing(models.Model):
    _name = 'mailing.mailing'
    _inherit = 'mailing.mailing'

    use_leads = fields.Boolean('Use Leads', compute='_compute_use_leads')
    crm_lead_count = fields.Integer('Leads/Opportunities Count', compute='_compute_crm_lead_count')

    def _compute_use_leads(self):
        self.use_leads = self.env.user.has_group('crm.group_use_lead')

    def _compute_crm_lead_count(self):
        lead_data = self.env['crm.lead'].with_context(active_test=False).sudo()._read_group(
            [('utm_reference', 'in', [f'{mailing._name},{mailing.id}' for mailing in self])],
            ['utm_reference'], ['__count'],
        )
        mapped_data = dict(lead_data)
        for mass_mailing in self:
            mass_mailing.crm_lead_count = mapped_data.get(f'{mass_mailing._name},{mass_mailing.id}', 0)

    def action_redirect_to_leads_and_opportunities(self):
        text = _("Leads") if self.use_leads else _("Opportunities")
        helper_header = _("No %s yet!", text)
        helper_message = _("Note that Odoo cannot track replies if they are sent towards email addresses to this database.")
        return {
            'context': {
                'active_test': False,
                'create': False,
                'search_default_group_by_create_date_day': True,
                'crm_lead_view_hide_month': True,
            },
            'domain': [('utm_reference', 'in', [f'{mailing._name},{mailing.id}' for mailing in self])],
            'help': Markup('<p class="o_view_nocontent_smiling_face">%s</p><p>%s</p>') % (
                helper_header, helper_message,
            ),
            'name': _("Leads Analysis"),
            'res_model': 'crm.lead',
            'type': 'ir.actions.act_window',
            'view_mode': 'tree,pivot,graph,form',
        }

    def _prepare_statistics_email_values(self):
        self.ensure_one()
        values = super(MassMailing, self)._prepare_statistics_email_values()
        if not self.user_id:
            return values
        if not self.env['crm.lead'].check_access_rights('read', raise_exception=False):
            return values
        values['kpi_data'][1]['kpi_col1'] = {
            'value': tools.misc.format_decimalized_number(self.crm_lead_count, decimal=0),
            'col_subtitle': _('LEADS'),
        }
        values['kpi_data'][1]['kpi_name'] = 'lead'
        return values
