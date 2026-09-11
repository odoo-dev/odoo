# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

# (sequence, value, label). A selection field is grouped and sorted in the order its values
# are declared, so the sequence is what orders the billable types in the reports; the numeric
# prefix of a value has no effect on it. Modules adding a type extend `_get_billable_types`.
# Labels use `_lt` (not `_`): they are evaluated once at import time into this module-level
# list, and `billable_type`'s selection is a callable, so `Field._description_selection`
# never runs them through `ir.model.fields`'s selection-translation lookup like it would for
# a plain list; only a lazy string still resolves per-language when read later.
BILLABLE_TYPES = [
    (10, '01_revenues_fixed', _lt('Service Revenue (Fixed Price)')),
    (20, '10_service_revenues', _lt('Service Revenue (Time & Materials)')),
    (30, '05_revenues_milestones', _lt('Service Revenue (Milestones)')),
    (40, '07_revenues_manual', _lt('Service Revenue (Manual)')),
    (70, '19_materials', _lt('Materials')),
    (90, '11_other_revenues', _lt('Other Revenue')),
    (180, '12_vendor_bill', _lt('Vendor Bills')),
    (200, '30_other_costs', _lt('Other Costs')),
]

REVENUE_BILLABLE_TYPES = [
    '01_revenues_fixed',
    '10_service_revenues',
    '05_revenues_milestones',
    '07_revenues_manual',
    '19_materials',
    '11_other_revenues',
]


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    billable_type = fields.Selection(selection='_selection_billable_type', string="Billable Type",
        compute='_compute_project_billable_type', compute_sudo=True, store=True, readonly=True)

    category_report = fields.Selection(
        [('revenues', 'Revenue'), ('costs', 'Costs')],
        compute='_compute_category_report', compute_sudo=True, store=True, readonly=True)

    def _get_billable_types(self):
        return list(BILLABLE_TYPES)

    def _selection_billable_type(self):
        return [(value, label) for _sequence, value, label in sorted(self._get_billable_types())]

    @api.depends('so_line.product_id', 'product_id', 'amount', 'category')
    def _compute_project_billable_type(self):
        for line in self:
            if line.amount >= 0 and line.unit_amount >= 0:
                product = line._get_billable_product()
                if product.type == 'consu':
                    invoice_type = '19_materials'
                elif product.type != 'service':
                    invoice_type = '11_other_revenues'
                elif product.invoice_policy == 'delivery':
                    service_type = product.service_type
                    if service_type == 'timesheet':
                        invoice_type = '10_service_revenues'
                    elif service_type == 'milestones':
                        invoice_type = '05_revenues_milestones'
                    elif service_type == 'manual':
                        invoice_type = '07_revenues_manual'
                    else:
                        invoice_type = '01_revenues_fixed'
                elif product.invoice_policy == 'order':
                    invoice_type = '01_revenues_fixed'
                else:
                    invoice_type = '11_other_revenues'
                line.billable_type = line._get_invoice_type(invoice_type)
            else:
                line._set_billable_cost()

    def _get_billable_product(self):
        return self.product_id or self.so_line.product_id

    def _set_billable_cost(self):
        if self.category == 'vendor_bill':
            self.billable_type = '12_vendor_bill'
        else:
            self.billable_type = '30_other_costs'

    def _get_invoice_type(self, invoice_type):
        return invoice_type

    @api.depends('billable_type')
    def _compute_category_report(self):
        for line in self:
            if line.billable_type in REVENUE_BILLABLE_TYPES:
                line.category_report = 'revenues'
            else:
                line.category_report = 'costs'

    def action_open_account_analytic_line_origine(self):
        self.ensure_one()
        if (self.so_line):
            return {
                'res_model': self.so_line._name,
                'type': 'ir.actions.act_window',
                'views': [[False, "form"]],
                'res_id': self.so_line.id,
            }
        return {
            'res_model': self._name,
            'type': 'ir.actions.act_window',
            'views': [[False, "form"]],
            'res_id': self.id,
        }
