# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    sale_order_count = fields.Integer(
        "Count of Source SO",
        compute='_compute_sale_order',
        groups='sales_team.group_sale_salesman')
    sale_ids = fields.One2many(
        'sale.order', string='Source Sale Orders',
        compute='_compute_sale_order')
    sale_line_ids = fields.Many2many(
        'sale.order.line', 'mrp_production_sale_line_rel', 'mrp_production_id',
        'sale_line_id' ,'Origin sale order line')

    @api.depends('sale_line_ids')
    def _compute_sale_order(self):
        for production in self:
            production.sale_ids = production.sale_line_ids.order_id
            production.sale_order_count = len(production.sale_ids)

    def action_view_sale_orders(self):
        self.ensure_one()
        sale_order_ids = self.sale_line_ids.order_id.ids
        action = {
            'res_model': 'sale.order',
            'type': 'ir.actions.act_window',
        }
        if len(sale_order_ids) == 1:
            action.update({
                'view_mode': 'form',
                'res_id': sale_order_ids[0],
            })
        else:
            action.update({
                'name': _("Sources Sale Orders of %s", self.name),
                'domain': [('id', 'in', sale_order_ids)],
                'view_mode': 'list,form',
            })
        return action

    def action_confirm(self):
        res = super().action_confirm()
        for production in self:
            if production.sale_line_id:
                production.move_finished_ids.filtered(
                    lambda m: m.product_id == production.product_id
                ).sale_line_id = production.sale_line_id
        return res
