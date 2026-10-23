# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class EventRegistrationTransferWizard(models.TransientModel):
    _name = 'event.registration.transfer.wizard'
    _description = "Transfer Ticket"

    registration_id = fields.Many2one('event.registration', string="Ticket", required=True, readonly=True)
    sender_partner_id = fields.Many2one(related='registration_id.partner_id', string="Current Owner")
    recipient_partner_id = fields.Many2one(
        'res.partner', string="Recipient", required=True,
        domain="[('id', '!=', sender_partner_id)]")

    def action_send_request(self):
        """ Send an acceptance link to the recipient. """
        self.ensure_one()
        self.env['event.registration.transfer']._action_request(self.registration_id, self.recipient_partner_id)
        return {'type': 'ir.actions.act_window_close'}

    def action_transfer_now(self):
        """ Transfer the ticket without waiting for the recipient's acceptance. """
        self.ensure_one()
        transfer = self.env['event.registration.transfer']._action_request(
            self.registration_id, self.recipient_partner_id)
        transfer.action_accept()
        return {'type': 'ir.actions.act_window_close'}
