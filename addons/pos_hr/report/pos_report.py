from odoo import _, models


class PosReportHr(models.Model):
    _inherit = 'pos.report'

    def _get_filter_descriptions(self, options, handler):
        descriptions = super()._get_filter_descriptions(options, handler)

        if employee_ids := options.get('employee_ids'):
            employee = self.env['hr.employee'].browse(employee_ids[0])
            descriptions.append({
                'label': _('Employee'),
                'value': employee.display_name,
            })

        return descriptions
