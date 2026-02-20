# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    repair_order_count = fields.Integer(
        string="Repair Order Count",
        groups='stock.group_stock_user',
        compute='_compute_repair_order_count',
    )

    def _compute_repair_order_count(self):
        if not self.env.user.has_group('stock.group_stock_user'):
            return

        repair_counts_per_partner = self.env['repair.order']._read_group(
            domain=[('partner_id', 'child_of', self.ids)],
            groupby=['partner_id'],
            aggregates=['__count'],
        )
        self.repair_order_count = 0
        for partner, count in repair_counts_per_partner:
            while partner:
                if partner in self:
                    partner.repair_order_count += count
                partner = partner.parent_id

    def _compute_application_statistics_hook(self):
        data_list = super()._compute_application_statistics_hook()
        if not self.env.user.has_group('stock.group_stock_user'):
            return data_list

        for partner in self.filtered('repair_order_count'):
            data_list[partner.id].append({
                'iconClass': "fa-wrench",
                'value': partner.repair_order_count,
                'label': self.env._("Repair Orders"),
            })
        return data_list

    def action_view_repair_orders(self):
        self.ensure_one()
        domain = [('partner_id', 'child_of', self.id)]
        action = {
            'name': self.env._("Repair Orders"),
            'res_model': 'repair.order',
            'type': 'ir.actions.act_window',
            'domain': domain,
            'context': {'default_partner_id': self.id},
            'view_mode': 'list,form',
        }
        if self.repair_order_count == 1:
            repair_order = self.env['repair.order'].search(domain, limit=1)
            action.update({
                'view_mode': 'form',
                'res_id': repair_order.id,
            })
        return action
