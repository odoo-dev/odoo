# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class BaseAutomationActionLink(models.Model):
    _name = 'base.automation.action.link'
    _description = 'Automation Rule Server Action Link'
    _inherits = {'ir.actions.server': 'action_server_id'}
    _log_access = False
    _order = 'sequence ASC'

    def _default_sequence(self):
        link = self.search([
            ('base_automation_id', '=', self.base_automation_id.id),
        ], limit=1, order="sequence DESC")
        return link.sequence + 1 if link else 1

    action_server_id = fields.Many2one(
        comodel_name='ir.actions.server',
        string='Action',
        ondelete='restrict',
        required=True,
        domain="[('model_id', '=', model_id)]",
    )
    base_automation_id = fields.Many2one('base.automation', string='Automation Rule', required=True, ondelete='cascade')
    sequence = fields.Integer(default=_default_sequence, required=True)

    def create_action(self):
        return self.action_server_id.create_action()

    def unlink_action(self):
        return self.action_server_id.unlink()

    def run(self):
        return self.action_server_id.run()
