# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    payment_attempt_count = fields.Integer(compute='_compute_payment_attempt_counts')
    open_payment_attempt_count = fields.Integer(compute='_compute_payment_attempt_counts')

    def _compute_payment_attempt_counts(self):
        Attempt = self.env['pos.payment.attempt']
        counts = dict(Attempt._read_group([('session_id', 'in', self.ids)], ['session_id'], ['__count']))
        open_counts = dict(Attempt._read_group(
            [('session_id', 'in', self.ids), ('is_open', '=', True), ('reviewed', '=', False)],
            ['session_id'], ['__count']))
        for session in self:
            session.payment_attempt_count = counts.get(session, 0)
            session.open_payment_attempt_count = open_counts.get(session, 0)

    def action_view_payment_attempts(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('pos_payment_attempt.action_pos_payment_attempt')
        action['domain'] = [('session_id', '=', self.id)]
        action['context'] = {}
        return action
