# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import AccessError


class ChannelPartner(models.Model):
    _name = 'mail.channel.partner'
    _description = 'Listeners of a Channel'
    _table = 'mail_channel_partner'
    _rec_name = 'partner_id'

    # identity
    partner_id = fields.Many2one('res.partner', string='Recipient', ondelete='cascade', required=True)
    partner_email = fields.Char('Email', related='partner_id.email', readonly=False)
    # channel
    channel_id = fields.Many2one('mail.channel', string='Channel', ondelete='cascade', required=True)
    # state
    custom_channel_name = fields.Char('Custom channel name')
    fetched_message_id = fields.Many2one('mail.message', string='Last Fetched')
    seen_message_id = fields.Many2one('mail.message', string='Last Seen')
    fold_state = fields.Selection([('open', 'Open'), ('folded', 'Folded'), ('closed', 'Closed')], string='Conversation Fold State', default='open')
    is_minimized = fields.Boolean("Conversation is minimized")
    is_pinned = fields.Boolean("Is pinned on the interface", default=True)
    last_meaningful_action_time = fields.Datetime('Last action time for the thread', default=fields.Datetime.now)
    rtc_inviting_partner_id = fields.Many2one('res.partner', string='Ringing partner')

    def _remove_rtc_invitation(self):
        """ Removes the invitation to the rtc call and notifies the inviting partner if removed. """
        notifications = []
        for record in self:
            if not record.rtc_inviting_partner_id:
                continue
            notifications.append([
                (self._cr.dbname, 'res.partner', record.rtc_inviting_partner_id.id),
                {
                    'type': 'rtc_outgoing_invitation_ended',
                    'payload': {
                        'channelId': record.channel_id.id,
                        'partnerId': record.partner_id.id,
                    },
                },
            ])
        self.write({'rtc_inviting_partner_id': False})
        self.env['bus.bus'].sendmany(notifications)

    @api.model_create_multi
    def create(self, vals_list):
        """Similar access rule as the access rule of the mail channel.

        It can not be implemented in XML, because when the record will be created, the
        partner will be added in the channel and the security rule will always authorize
        the creation.
        """
        if not self.env.is_admin():
            for vals in vals_list:
                if 'channel_id' in vals:
                    channel_id = self.env['mail.channel'].browse(vals['channel_id'])
                    if not channel_id._can_invite(vals.get('partner_id')):
                        raise AccessError(_('This user can not be added in this channel'))
        return super(ChannelPartner, self).create(vals_list)

    def write(self, vals):
        if not self.env.is_admin():
            if {'channel_id', 'partner_id', 'partner_email'} & set(vals):
                raise AccessError(_('You can not write on this field'))
        if vals.get('is_pinned'):
            vals['last_meaningful_action_time'] = fields.Datetime.now()
        return super(ChannelPartner, self).write(vals)
