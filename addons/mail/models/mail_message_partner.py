from odoo import fields, models


class MailMessagePartner(models.Model):
    _name = 'mail.message.partner'
    _description = 'Mail Message Partner'
    _table = 'mail_message_res_partner_rel'
    _log_access = False

    mail_message_id = fields.Many2one('mail.message', required=True, ondelete='cascade', index=True)
    # recipients: include inactive partners (they may have been archived after
    # the message was sent, but they should remain visible in the relation)
    res_partner_id = fields.Many2one('res.partner', required=True, ondelete='cascade',
                                     context={'active_test': False})
    recipient_type = fields.Selection([
        ('to', 'To'),
        ('cc', 'CC'),
        # ('bcc', 'BCC'),
    ], default='to', string='Recipient Type')
