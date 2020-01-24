# -*- coding: utf-8 -*-

from odoo import api, fields, models


class Notification(models.Model):
    _inherit = 'mail.notification'

    notification_type = fields.Selection(selection_add=[('snailmail', 'Snailmail')])
    letter_id = fields.Many2one('snailmail.letter', string='Snailmail Letter', index=True, ondelete='set null')
    failure_type = fields.Selection(selection_add=[
        ('snailmail_credit_error', 'Snailmail Credit Error'),
        ('snailmail_trial_error', 'Snailmail Trial Error'),
        ('snailmail_no_price_available', 'Snailmail No Price Available'),
        ('snailmail_missing_required_fields', 'Snailmail Missing Required Fields'),
        ('snailmail_format_error', 'Snailmail Format Error'),
        ('snailmail_unknown_error', 'Snailmail Unknown Error'),
    ])

    @api.model
    def _types_for_message_list(self):
        return super()._types_for_message_list() + ['snailmail']
