# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo import api, fields, models


class MrpManufacturingLine(models.Model):
    _name = 'mrp.manufacturing.line'
    _description = 'Manufacturing Line'
    _order = 'sequence, id'
    _check_company_auto = True

    sequence = fields.Integer(default=10)
    name = fields.Char(required=True, translate=True)
    active = fields.Boolean(default=True)
    color = fields.Integer()
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, index=True)
    workcenter_ids = fields.Many2many('mrp.workcenter', string='Work Centers', check_company=True)
    production_count = fields.Integer('# Manufacturing Orders', compute='_compute_production_count')
    workorder_progress_count = fields.Integer('# In Progress', compute='_compute_workorder_stats')
    workorder_late_count = fields.Integer('# Late', compute='_compute_workorder_stats')

    @api.depends('workcenter_ids')
    def _compute_production_count(self):
        for line in self:
            line.production_count = self.env['mrp.production'].search_count(line._get_production_domain())

    @api.depends('workcenter_ids')
    def _compute_workorder_stats(self):
        """ Work orders in progress and late on the work centers of the lines. """
        workorders = self.env['mrp.workorder'].search([
            ('workcenter_id', 'in', self.workcenter_ids.ids),
            ('state', 'in', ('blocked', 'ready', 'progress')),
        ])
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        for line in self:
            line_workorders = workorders.filtered(lambda wo: wo.workcenter_id in line.workcenter_ids)
            line.workorder_progress_count = len(line_workorders.filtered(lambda wo: wo.state == 'progress'))
            line.workorder_late_count = len(line_workorders.filtered(
                lambda wo: wo.state in ('blocked', 'ready') and wo.date_start and wo.date_start < today))

    def _get_production_domain(self):
        self.ensure_one()
        return [
            ('workcenter_ids', 'in', self.workcenter_ids.ids),
            ('state', 'in', ('draft', 'confirmed', 'progress', 'to_close')),
        ]

    def action_open_productions(self):
        """ Kanban of the manufacturing orders in a work center of the line, with
        a column per work center of the line. """
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('mrp.mrp_production_action')
        kanban_view = self.env.ref('mrp.mrp_production_kanban_view')
        action.update({
            'name': self.name,
            'domain': [
                ('picking_type_id.active', '=', True),
                ('workcenter_ids', 'in', self.workcenter_ids.ids),
            ],
            'view_mode': 'kanban,list,form',
            'views': [(kanban_view.id, 'kanban'), (False, 'list'), (False, 'form')],
            'context': {
                'search_default_todo': True,
                'default_company_id': (self.company_id or self.env.company).id,
                'manufacturing_line_workcenter_ids': self.workcenter_ids.ids,
                'default_manufacturing_line_id': self.id,
            },
        })
        return action

    @api.model
    def action_open_overview(self):
        """ Overview of the manufacturing orders: by manufacturing line as soon as
        there is one, otherwise the kanban of all work centers. """
        if self.search_count([], limit=1):
            return self.env['ir.actions.act_window']._for_xml_id('mrp.mrp_manufacturing_line_kanban_action')
        action = self.env['ir.actions.act_window']._for_xml_id('mrp.mrp_production_action')
        kanban_view = self.env.ref('mrp.mrp_production_kanban_view')
        action.update({
            'view_mode': 'kanban,list,form',
            'views': [(kanban_view.id, 'kanban'), (False, 'list'), (False, 'form')],
            'context': {
                'search_default_todo': True,
                'default_company_id': self.env.company.id,
            },
        })
        return action
