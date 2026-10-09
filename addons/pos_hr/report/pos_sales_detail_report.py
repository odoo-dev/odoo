from odoo import models


class PosSalesDetailReportHr(models.AbstractModel):
    _inherit = 'pos.sales.detail.report'

    def _get_filters(self):
        filters = super()._get_filters()
        filters.append({
            'type': 'single_select', 'field': 'employee_ids', 'model': 'hr.employee', 'label': 'Employee',
        })
        return filters

    def _get_sale_line_domain(self, options, is_refund=False):
        domain = super()._get_sale_line_domain(options, is_refund=is_refund)
        employee_ids = options.get('employee_ids')
        if employee_ids:
            domain += [('order_id.employee_id', 'in', employee_ids)]
        return domain

    def _get_order_domain(self, options):
        domain = super()._get_order_domain(options)
        employee_ids = options.get('employee_ids')
        if employee_ids:
            domain += [('employee_id', 'in', employee_ids)]
        return domain
