from odoo import fields, models, _


class HrAllocatedDurationReport(models.TransientModel):
    _name = "hr.allocated.duration.report"
    _description = "Temporary graph data"

    label = fields.Char()
    value = fields.Float()
    date = fields.Date()
    time_type_id = fields.Many2one('hr.work.entry.type')
    allocation_id = fields.Many2one('hr.leave.allocation')

    def action_open_graph(self):
        self.search([]).unlink()
        employee1 = self.env['hr.leave.allocation'].search([('accrual_plan_id', '!=', False)], limit=1).employee_id
        employee2 = self.env['hr.leave.allocation'].search([
            ('accrual_plan_id', '!=', False),
            ('employee_id', '!=', employee1.id),
        ], limit=1).employee_id
        allocations_data = self.env['hr.work.entry.type'].search([]).get_allocation_data(employee1 | employee2)
        vals = []
        for employee, type_data in allocations_data.items():
            vals.append({
                'label': f'{employee.display_name} - {type_data[0]} - ',
            })
        self.create([{'label': k, 'value': v, 'date': d} for k, v, d in data])
        return {
            'type': 'ir.actions.act_window',
            'name': 'My Dynamic Graph',
            'res_model': self._name,
            'view_mode': 'graph',
            'target': 'current',
        }
