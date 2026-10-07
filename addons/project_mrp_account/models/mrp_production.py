# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command, _, api, fields, models
from odoo.exceptions import ValidationError


class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    has_analytic_account = fields.Boolean(compute='_compute_has_analytic_account')
    extra_cost_analytic_account_line_ids = fields.Many2many('account.analytic.line', 'mrp_production_ec_analytic_rel', copy=False)

    @api.depends('project_id')
    def _compute_has_analytic_account(self):
        has_analytic_account_per_project_id = {p.id: bool(p._get_analytic_accounts()) for p in self.project_id}
        for production in self:
            production.has_analytic_account = has_analytic_account_per_project_id.get(production.project_id.id, False)

    def action_view_analytic_accounts(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'account.analytic.account',
            'domain': [('id', 'in', self.project_id._get_analytic_accounts().ids)],
            'name': _('Analytic Accounts'),
            'view_mode': 'list,form',
        }

    def write(self, vals):
        res = super().write(vals)
        for production in self:
            if 'project_id' in vals and production.state != 'draft':
                production.move_raw_ids._create_analytic_move()
                production.workorder_ids._create_or_update_analytic_entry()
                if production.state == 'done':
                    production._create_or_update_extra_cost_analytic_entry()
        return res

    def _validate_analytic_distribution(self):
        for production in self:
            # Pass the produced product so applicabilities filtered by product_categ_id
            plans = self.env['account.analytic.plan'].sudo().with_company(production.company_id).get_relevant_plans(
                business_domain='manufacturing_order',
                company_id=production.company_id.id,
                product=production.product_id.id,
            )
            missing_plan_names = [
                plan['name'] for plan in plans
                if plan['applicability'] == 'mandatory' and not production.project_id[plan['column_name']]
            ]
            if missing_plan_names:
                raise ValidationError(_(
                    "The Project linked to the Manufacturing Order is missing a mandatory distribution for the analytic plan(s) %(missing_plan_names)s.",
                    missing_plan_names=', '.join(missing_plan_names),
                ))

    def action_confirm(self):
        self._validate_analytic_distribution()
        return super().action_confirm()

    def action_cancel(self):
        res = super().action_cancel()
        self.sudo().extra_cost_analytic_account_line_ids.unlink()
        return res

    def button_mark_done(self):
        res = super().button_mark_done()
        self._create_or_update_extra_cost_analytic_entry()
        return res

    def unlink(self):
        self.sudo().extra_cost_analytic_account_line_ids.unlink()
        return super().unlink()

    def _prepare_analytic_line_values(self, account_field_values, amount, unit_amount):
        self.ensure_one()
        return {
            'name': _("[EXTRA COST] %s", self.product_id.display_name),
            'amount': amount,
            **account_field_values,
            'unit_amount': unit_amount,
            'product_id': self.product_id.id,
            'product_uom_id': self.product_id.uom_id.id,
            'company_id': self.company_id.id,
            'ref': self.display_name,
            'category': 'manufacturing_order',
        }

    def _create_or_update_extra_cost_analytic_entry(self):
        analytic_account_model = self.env['account.analytic.account']

        for production in self.sudo():
            if not production.extra_cost or not production.qty_producing:
                continue

            analytic_lines = production.extra_cost_analytic_account_line_ids
            project = production.project_id
            distribution = project._get_analytic_distribution() if project and production.picking_type_id.analytic_costs else {}

            if not distribution and not analytic_lines:
                continue

            total_extra_cost = -(production.qty_producing * production.extra_cost)
            unit_amount = production.qty_producing

            line_vals = analytic_account_model._perform_analytic_distribution(
                distribution,
                total_extra_cost,
                unit_amount,
                analytic_lines,
                production,
            )
            production.extra_cost_analytic_account_line_ids = [Command.create(line_vals_item) for line_vals_item in line_vals]
