# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class MailBlacklist(models.Model):
    """ Model of blacklisted email addresses to stop sending emails."""
    _inherit = 'mail.blacklist'

    _mail__mt_comment = models.Ref('mail.mt_comment', 'mail.message.subtype')

    opt_out_reason_id = fields.Many2one(
        'mailing.subscription.optout', string='Opt-out Reason',
        ondelete='restrict',
        tracking=10)

    def _track_log_get_default_subtype(self, track_init_values):
        self.ensure_one()
        if 'opt_out_reason_id' in track_init_values and self.opt_out_reason_id:
            return self._mail__mt_comment
        return super()._track_log_get_default_subtype(track_init_values)
