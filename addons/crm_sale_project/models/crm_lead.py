from odoo import models


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    def _get_project_create_from_lead_context(self):
        """Return the context for creating a project from a lead."""
        self.ensure_one()
        sale_lines_per_delivered_method = dict(
            self.env['sale.order.line']._read_group(
                [
                    ('order_id', 'in', self.order_ids.ids),
                    ('is_service', '=', True),
                    ('qty_delivered_method', 'in', ['timesheets', 'milestones', 'manual'])
                ],
                ['qty_delivered_method'],
                ['id:recordset'],
            )
        )
        sale_line = self.env['sale.order.line']
        if sols := (sale_lines_per_delivered_method.get('timesheets')
                    or sale_lines_per_delivered_method.get('milestones')
                    or sale_lines_per_delivered_method.get('manual')):
            sale_line = sols[:1]
        default_order_id = False
        if sale_line:
            default_order_id = sale_line.order_id.id
        elif self.order_ids:
            default_order_id = self.order_ids[0].id

        return dict(
            **super()._get_project_create_from_lead_context(),
            default_allow_billable=True,
            default_reinvoiced_sale_order_id=default_order_id,
            default_sale_line_id=sale_line.id,
        )

    def _prepare_opportunity_quotation_context(self):
        context = super()._prepare_opportunity_quotation_context()
        context.update({
            'is_sale_order': True,
            'default_project_id': self.sudo().project_ids[-1:].id,
        })
        return context
