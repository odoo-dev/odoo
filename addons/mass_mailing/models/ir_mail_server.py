# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools.misc import format_date


class IrMail_Server(models.Model):
    _inherit = 'ir.mail_server'

    active_mailing_ids = fields.One2many(
        comodel_name='mailing.mailing',
        inverse_name='mail_server_id',
        string='Active mailing using this mail server',
        readonly=True,
        domain=[('state', '!=', 'done'), ('active', '=', True)])

    @api.constrains('owner_user_id')
    def _check_owner_no_active_mailings(self):
        """Prevent setting an owner on a server that is used in active mass mailings."""
        for server in self:
            if server.owner_user_id and server.active_mailing_ids:
                raise ValidationError(_(
                    'The mail server "%s" cannot be set as personal because it is used in active mass mailings: %s.',
                    server.display_name,
                    ', '.join(server.active_mailing_ids.mapped('display_name')),
                ))

    def _active_usages_compute(self):
        def format_usage(mailing_id):
            base = _('Mass Mailing "%s"', mailing_id.display_name)
            if not mailing_id.schedule_date:
                return base
            details = _('(scheduled for %s)', format_date(self.env, mailing_id.schedule_date))
            return f'{base} {details}'

        usages_super = super()._active_usages_compute()
        default_mail_server_id = self.env['mailing.mailing']._get_default_mail_server_id()
        for record in self:
            usages = []
            if default_mail_server_id == record.id:
                usages.append(_('Email Marketing uses it as its default mail server to send mass mailings'))
            usages.extend(map(format_usage, record.active_mailing_ids))
            if usages:
                usages_super.setdefault(record.id, []).extend(usages)
        return usages_super
