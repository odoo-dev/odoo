# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools.misc import groupby as tools_groupby


class MailActivityPlan(models.Model):
    _name = 'mail.activity.plan'
    _description = 'Activity Plan'

    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        default_res_model = self._context.get('default_res_model')
        if 'res_model' in fields and default_res_model:
            res['res_model'] = default_res_model
        return res

    def _get_model_selection(self):
        return [
            (model.model, model.name)
            for model in self.env['ir.model'].sudo().search(
                ['&', ('is_mail_thread', '=', True), ('transient', '=', False)])
        ]

    name = fields.Char('Name', required=True)
    company_id = fields.Many2one(
        'res.company', default=lambda self: self.env.company)
    template_ids = fields.One2many(
        'mail.activity.plan.template', 'plan_id',
        string='Activities',
        domain="[('company_id', '=', company_id)]",
        check_company=True)
    active = fields.Boolean(default=True)
    res_model = fields.Selection(selection=_get_model_selection, string="Model", required=True,
                                 help='Specify a model if the activity should be specific to a model'
                                      ' and not available when managing activities for other models.')
    steps_count = fields.Integer(compute='_compute_steps_count')
    assignation_summary = fields.Html('Assignation summary', compute='_compute_assignation')
    has_user_on_demand = fields.Boolean('Has on demand responsible', compute='_compute_assignation')

    @api.constrains('res_model')
    def _check_res_model_compatibility_with_templates(self):
        self.template_ids._check_activity_type_res_model()

    @api.depends('template_ids')
    def _compute_steps_count(self):
        activity_template_data = self.env['mail.activity.plan.template']._read_group(
            [('plan_id', 'in', self.ids)],
            ['plan_id'],
            ['__count'],
        )
        steps_count = {plan.id: count for plan, count in activity_template_data}
        for plan in self:
            plan.steps_count = steps_count.get(plan.id, 0)

    @api.depends('template_ids.responsible_type', 'template_ids.summary')
    def _compute_assignation(self):
        templates_data_by_plan = dict(tools_groupby(self.env['mail.activity.plan.template'].search_read(
            [('plan_id', 'in', self.ids)],
            ['activity_type_id', 'plan_id', 'responsible_type', 'sequence', 'summary']
        ), key=lambda r: r['plan_id'][0]))
        for plan in self:
            templates_data = templates_data_by_plan.get(plan.id, False)
            if templates_data:
                formatted = ['<ul>']
                has_user_on_demand = False
                for template_data in sorted(templates_data, key=lambda d: d["sequence"]):
                    formatted.append(
                        f"<li>{template_data['activity_type_id'][1]} - {template_data['responsible_type']}" +
                        (f": {template_data['summary']}" if template_data['summary'] else '') +
                        "</li>")
                    has_user_on_demand |= template_data['responsible_type'] == 'on_demand'
                formatted.append('</ul>')
                plan.assignation_summary = ''.join(formatted)
                plan.has_user_on_demand = has_user_on_demand
            else:
                plan.assignation_summary = ''
                plan.has_user_on_demand = False
