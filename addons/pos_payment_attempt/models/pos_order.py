# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    payment_attempt_ids = fields.One2many('pos.payment.attempt', 'pos_order_id', string="Payment Attempts")
    payment_attempt_count = fields.Integer(compute='_compute_payment_attempt_count')

    def _compute_payment_attempt_count(self):
        counts = dict(self.env['pos.payment.attempt']._read_group(
            [('pos_order_id', 'in', self.ids)], ['pos_order_id'], ['__count']))
        for order in self:
            order.payment_attempt_count = counts.get(order, 0)

    def _process_payment_lines(self, pos_order, order, pos_session, draft):
        res = super()._process_payment_lines(pos_order, order, pos_session, draft)
        self.env['pos.payment.attempt'].search([
            ('order_uuid', '=', order.uuid),
            '|', ('pos_order_id', '=', False), ('pos_payment_id', '=', False),
        ])._link_records()
        return res

    def action_view_payment_attempts(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('pos_payment_attempt.action_pos_payment_attempt')
        action['domain'] = [('pos_order_id', '=', self.id)]
        action['context'] = {}
        return action
