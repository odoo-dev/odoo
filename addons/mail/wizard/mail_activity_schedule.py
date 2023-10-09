# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup, escape

from odoo import api, fields, models, _
from odoo.addons.mail.tools.parser import parse_res_ids
from odoo.exceptions import ValidationError
from odoo.osv import expression
from odoo.tools.misc import clean_context


class MailActivitySchedule(models.TransientModel):
    _name = 'mail.activity.schedule'
    _description = 'Activity schedule plan Wizard'
    _batch_size = 500

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        context = self.env.context
        active_res_ids = parse_res_ids(context.get('active_ids'))
        if 'res_ids' in fields_list:
            if active_res_ids and len(active_res_ids) <= self._batch_size:
                res['res_ids'] = f"{context['active_ids']}"
            elif not active_res_ids and context.get('active_id'):
                res['res_ids'] = f"{[context['active_id']]}"
        res_model = context.get('active_model') or context.get('params', {}).get('active_model', False)
        if 'res_model' in fields_list:
            res['res_model'] = res_model
        res_model_id = self.env['ir.model']._get_id(res_model) if res_model else False
        if 'res_model_id' in fields_list:
            res['res_model_id'] = res_model_id
        return res

    res_model_id = fields.Many2one('ir.model', required=True, string="res_model_id", ondelete='cascade')
    res_model = fields.Char(related_sudo='res_model_id.model', store=True, readonly=True)
    res_ids = fields.Text('Document IDs', compute='_compute_res_ids', readonly=True, store=True, precompute=True)
    company_id = fields.Many2one('res.company', 'Company',
                                 compute='_compute_company_id', required=True)
    # usage
    error = fields.Html(compute='_compute_error')
    has_error = fields.Boolean(compute='_compute_error')
    is_batch_mode = fields.Boolean(compute='_compute_is_batch_mode')
    # Plan
    available_plan_ids = fields.Many2many('mail.activity.plan', compute='_compute_available_plan_ids',
                                          store=True, compute_sudo=True)
    plan_id = fields.Many2one('mail.activity.plan', domain="[('id', 'in', available_plan_ids)]",
                              compute='_compute_plan_id', store=True, readonly=False)
    plan_has_user_on_demand = fields.Boolean(related="plan_id.has_user_on_demand")
    plan_assignation_summary = fields.Html(related='plan_id.assignation_summary')
    on_demand_user_id = fields.Many2one(
        'res.users', 'Assigned To (On demand)',
        help='Choose assignation for activities with on demand assignation.',
        default=lambda self: self.env.user)
    date_plan_deadline = fields.Date('Plan Due Date', compute='_compute_date_plan_deadline',
                                     store=True, readonly=False)
    # Activity
    activity_type_id = fields.Many2one(
        'mail.activity.type', string='Activity Type',
        compute='_compute_activity_type_id', store=True, readonly=False,
        domain="['|', ('res_model', '=', False), ('res_model', '=', res_model)]", ondelete='set null')
    activity_category = fields.Selection(related='activity_type_id.category', readonly=True)
    date_deadline = fields.Date('Due Date', default=fields.Date.context_today)
    summary = fields.Char('Summary')
    note = fields.Html('Note', sanitize_style=True)
    chaining_type = fields.Selection(related='activity_type_id.chaining_type', readonly=True)
    user_id = fields.Many2one('res.users', 'Assigned to', default=lambda self: self.env.user)
    # Technical field used to post process the created activity (meaningless in batch mode)
    activity_id = fields.Many2one('mail.activity')

    def _compute_res_ids(self):
        context = self.env.context
        for scheduler in self.filtered(lambda scheduler: not scheduler.res_ids):
            active_res_ids = parse_res_ids(context.get('active_ids'))
            if active_res_ids and len(active_res_ids) <= self._batch_size:
                scheduler.res_ids = f"{context['active_ids']}"
            elif not active_res_ids and context.get('active_id'):
                scheduler.res_ids = f"{[context['active_id']]}"

    @api.depends('res_model_id', 'res_ids')
    def _compute_company_id(self):
        for scheduler in self:
            applied_on = scheduler._get_applied_on_records()
            scheduler.company_id = (applied_on and 'company_id' in applied_on[0]._fields and applied_on[0].company_id
                                    ) or self.env.company

    @api.depends('company_id', 'res_model_id', 'res_ids',
                 'plan_id', 'on_demand_user_id', 'available_plan_ids',  # plan specific
                 'activity_type_id', 'user_id')  # activity specific
    def _compute_error(self):
        for scheduler in self:
            errors = set()
            applied_on = scheduler._get_applied_on_records()
            if applied_on and ('company_id' in scheduler.env[applied_on._name]._fields and
                               len(applied_on.mapped('company_id')) > 1):
                errors.add(_('The records must belong to the same company.'))
            if scheduler.plan_id:
                scheduler._add_errors_plan(errors, applied_on)
            else:
                scheduler._add_errors_activity(errors, applied_on)
            if errors:
                error_display = [
                    _('The plan "%s" cannot be launched:', escape(scheduler.plan_id.name)) if scheduler.plan_id
                    else _('The activity cannot be launched:'),
                    '<br><ul>'
                ]
                for error in errors:
                    error_display.append(f'<li>{error}</li>')
                error_display.append('</ul>')
                scheduler.error = ''.join(error_display)
                scheduler.has_error = True
            else:
                scheduler.error = False
                scheduler.has_error = False

    @api.depends('res_ids')
    def _compute_is_batch_mode(self):
        for scheduler in self:
            scheduler.is_batch_mode = len(scheduler._evaluate_res_ids()) > 1

    @api.depends('company_id', 'res_model_id', 'res_ids')
    def _compute_available_plan_ids(self):
        for scheduler in self:
            scheduler.available_plan_ids = self.env['mail.activity.plan'].search(self._get_search_available_plan_domain())

    @api.depends_context('plan_mode')
    @api.depends('available_plan_ids')
    def _compute_plan_id(self):
        for scheduler in self:
            if self.env.context.get('plan_mode'):
                scheduler.plan_id = scheduler.env['mail.activity.plan'].search(
                    [('id', 'in', self.available_plan_ids.ids)], order='id', limit=1)
            else:
                scheduler.plan_id = False

    def _compute_date_plan_deadline(self):
        """ Meant to be overriden. """

    @api.depends('res_model')
    def _compute_activity_type_id(self):
        for scheduler in self:
            if not scheduler.activity_type_id:
                scheduler.activity_type_id = scheduler.env['mail.activity']._default_activity_type_for_model(scheduler.res_model)

    # Any writable fields that can change error computed field
    @api.constrains('res_model_id', 'res_ids',
                    'plan_id', 'on_demand_user_id',  # plan specific
                    'activity_type_id', 'user_id')  # activity specific
    def _check_consistency(self):
        for scheduler in self:
            if scheduler.error:
                raise ValidationError(scheduler.error)

    @api.constrains('res_ids')
    def _check_res_ids(self):
        """ Check res_ids is a valid list of integers (or Falsy). """
        for scheduler in self:
            scheduler._evaluate_res_ids()

    @api.onchange('activity_type_id')
    def _onchange_activity_type_id(self):
        self.env['mail.activity']._apply_activity_type_defaults(self.activity_type_id, self)

    # ------------------------------------------------------------
    # PLAN-BASED SCHEDULING API
    # ------------------------------------------------------------

    def action_schedule_plan(self):
        applied_on = self._get_applied_on_records()
        for record in applied_on:
            body = _('The plan "%(plan_name)s" has been started', plan_name=self.plan_id.name)
            activity_descriptions = set()
            for activity in self._get_activities_to_schedule():
                if activity.responsible_type == 'on_demand':
                    responsible = self.on_demand_user_id
                else:
                    responsible = activity._determine_responsible(self.on_demand_user_id, record)['responsible']
                date_deadline = self.env['mail.activity']._calculate_date_deadline(
                    activity.activity_type_id) if not self.date_plan_deadline else self.date_plan_deadline
                self._get_record_for_scheduling(record, responsible).activity_schedule(
                    activity_type_id=activity.activity_type_id.id,
                    summary=activity.summary,
                    note=activity.note,
                    user_id=responsible.id,
                    date_deadline=date_deadline
                )
                activity_descriptions.add(_('%(activity)s, assigned to %(name)s, due on the %(deadline)s',
                                            activity=activity.summary or activity.activity_type_id.name,
                                            name=responsible.name, deadline=date_deadline))

            if activity_descriptions:
                body += Markup('<ul>' +
                               ''.join(f'<li>{escape(description)}</li>' for description in activity_descriptions) +
                               '</ul>')
            record.message_post(body=body)

        if len(applied_on) == 1:
            return {
                'type': 'ir.actions.act_window',
                'res_model': self.res_model,
                'res_id': applied_on.id,
                'name': applied_on.display_name,
                'view_mode': 'form',
                'views': [(False, "form")],
            }

        return {
            'type': 'ir.actions.act_window',
            'res_model': self.res_model,
            'name': _('Launch Plans'),
            'view_mode': 'tree,form',
            'target': 'current',
            'domain': [('id', 'in', applied_on.ids)],
        }

    def _add_errors_plan(self, errors, applied_on):
        self.ensure_one()
        for record in applied_on:
            for activity_template in self.plan_id.template_ids:
                error = activity_template._determine_responsible(self.on_demand_user_id, record)['error']
                if error:
                    errors.add(error)
        if self.plan_id and self.plan_id.id not in self.available_plan_ids.ids:
            errors.add(
                _('The plan is not compatible with the selected records (compatible plans: %(compatible_plans)s).',
                  compatible_plans=','.join(plan.name for plan in self.available_plan_ids)))

    # ------------------------------------------------------------
    # ACTIVITY-BASED SCHEDULING API
    # ------------------------------------------------------------

    def action_schedule_activities(self):
        self._action_schedule_activities()

    def action_schedule_and_mark_as_done(self):
        self._action_schedule_activities().action_done()

    def action_done_schedule_next(self):
        ctx = dict(
            clean_context(self.env.context),
            default_previous_activity_type_id=self.activity_type_id.id,
            activity_previous_deadline=self.date_deadline,
            default_res_ids=self.res_ids,
            default_res_model=self.res_model,
        )
        _messages, next_activities = self._action_schedule_activities()._action_done()
        if next_activities:
            return False
        return {
            'name': _("Schedule Activity On Selected Records") if self.is_batch_mode else _("Schedule Activity"),
            'context': ctx,
            'view_mode': 'form',
            'res_model': 'mail.activity.schedule',
            'views': [(False, 'form')],
            'type': 'ir.actions.act_window',
            'target': 'new',
        }

    def _action_schedule_activities(self):
        return self._get_applied_on_records().activity_schedule(
            activity_type_id=self.activity_type_id.id,
            summary=self.summary,
            note=self.note,
            user_id=self.user_id.id,
            date_deadline=self.date_deadline
        )

    def _add_errors_activity(self, errors, applied_on):
        self.ensure_one()
        if not self.user_id:
            errors.add(_('Responsible is required'))
        if not self.activity_type_id:
            errors.add(_('Activity type is required'))

    # ------------------------------------------------------------
    # TOOLS
    # ------------------------------------------------------------

    def _evaluate_res_ids(self):
        """ Parse composer res_ids, which can be: an already valid list or
        tuple (generally in code), a list or tuple as a string (coming from
        actions). Void strings / missing values are evaluated as an empty list.

        :return: a list of IDs (empty list in case of falsy strings)"""
        self.ensure_one()
        return parse_res_ids(self.res_ids) or []

    def _get_activities_to_schedule(self):
        return self.plan_id.template_ids

    def _get_applied_on_records(self):
        return self.env[self.res_model].browse(self._evaluate_res_ids())

    @api.model
    def _get_record_for_scheduling(self, record, responsible):
        """ Get the record on which the activity will be linked when launching a plan.

        :param <res.user> responsible: responsible

        The base implementation returns the record itself which is the common case.
        This method is meant to be overriden in other modules to return a different
        record if needed. That method has been introduced for the hr module where we
        needed to link the activity to another record for security reason.
        """
        return record

    def _get_search_available_plan_domain(self):
        self.ensure_one()
        return expression.AND([
            expression.OR([[('company_id', '=', False)], [('company_id', '=', self.company_id.id)]]),
            expression.OR([[('res_model', '=', False)], [('res_model', '=', self.res_model)]]),
        ])
