from odoo import api, models


class ProjectUpdate(models.Model):
    _inherit = 'project.update'

    def _get_common_services_values(self, project, company_uom):
        services = []
        sols = self.env['sale.order.line'].search(
            project._get_sale_items_domain([
                ('is_downpayment', '=', False),
            ]),
        )
        product_uom_unit = self.env.ref('uom.product_uom_unit')
        for sol in sols:
            is_unit = sol.product_uom == product_uom_unit
            if sol.product_uom.category_id == company_uom.category_id or is_unit:
                product_uom_qty = sol.product_uom._compute_quantity(sol.product_uom_qty, company_uom, raise_if_failure=False)
                qty_delivered = sol.product_uom._compute_quantity(sol.qty_delivered, company_uom, raise_if_failure=False)
                qty_invoiced = sol.product_uom._compute_quantity(sol.qty_invoiced, company_uom, raise_if_failure=False)
                unit = sol.product_uom if is_unit else company_uom
                services.append({
                    'name': sol.with_context(with_price_unit=True).display_name,
                    'sold_value': product_uom_qty,
                    'effective_value': qty_delivered,
                    'invoiced_value': qty_invoiced,
                    'unit': unit.name,
                    'is_unit': is_unit,
                    'sol': sol,
                })
        return services

    @api.model
    def _get_template_values(self, project):
        template_values = super()._get_template_values(project)
        services = self._get_services_values(project)
        show_sold = template_values['project'].allow_billable and len(services.get('data', [])) > 0

        return {
            **template_values,
            'services': services,
            'show_sold': show_sold,
        }

    @api.model
    def _get_services_values(self, project):
        if not project.allow_billable:
            return {}

        company_uom = self.env.ref('uom.product_uom_unit')
        services = self._get_common_services_values(project, company_uom)
        return {
            'data': services,
        }
