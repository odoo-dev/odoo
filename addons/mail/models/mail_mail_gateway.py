from odoo import api, fields, models


class MailMailGateway(models.Model):
    """ Model holding RFC2822 email messages unrouted by mail gateway. """
    _name = 'mail.mail.gateway'
    _description = 'Incoming Email'
    _order = 'id desc'
    _rec_name = 'subject'

    # content
    subject = fields.Char('Subject')
    date = fields.Datetime('Date', default=fields.Datetime.now)
    body = fields.Html('Contents', default='', sanitize_style=True)

    attachment_ids = fields.Many2many(
        'ir.attachment',
        string='Attachments', bypass_search_access=True)

    # origin
    email_from = fields.Char('From', help="Email address of the sender. This field is set when no matching partner is found and replaces the author_id field in the chatter.")
    author_id = fields.Many2one(
        'res.partner', 'Author', index=True, ondelete='set null',
        help="Author of the message. If not set, email_from may hold an email address that did not match any partner.")

    # recipients: include inactive partners (they may have been archived after
    # the message was sent, but they should remain visible in the relation)
    partner_ids = fields.Many2many('res.partner', string='Recipients', context={'active_test': False})
    # email recipients of incoming emails: comma separated list of emails (not necessarily normalized)
    email_to = fields.Text('To', help='Message recipients (emails)')
    email_cc = fields.Char('Cc', help='Carbon copy message recipients')

    # mail gateway
    message_id = fields.Char('Message-Id', help='Message unique identifier', index='btree', readonly=True, copy=False)
    fetchmail_server_id = fields.Many2one('fetchmail.server', "Inbound Mail Server", readonly=True, index='btree_not_null')
    references = fields.Text('References', help='Message references, such as identifiers of previous messages', readonly=True)
    headers = fields.Text('Headers', copy=False)

    failure_type = fields.Selection(selection=[
        # generic
        ("unknown", "Unknown error"),
        # mail
        ("mail_spam", "Detected As Spam"),
        ("mail_email_invalid", "Invalid email address"),
        ("mail_email_missing", "Missing email"),
        ("mail_from_invalid", "Invalid from address"),
        ("mail_from_missing", "Missing from address"),
        ("mail_smtp", "Connection failed (outgoing mail server problem)"),
        # mass mode
        ("mail_bl", "Blacklisted Address"),
        ("mail_optout", "Opted Out"),
        ("mail_dup", "Duplicated Email"),
        ], string='Failure type')
    failure_reason = fields.Text(
        'Failure Reason', readonly=True, copy=False,
        help="Failure reason. This is usually the exception thrown by the email server, stored to ease the debugging of mailing issues.")

    @api.model_create_multi
    def create(self, vals_list):
        new_mails = super().create(vals_list)

        new_mails_w_attach = self.env['mail.mail']
        for mail, values in zip(new_mails, vals_list):
            if values.get('attachment_ids'):
                new_mails_w_attach += mail
        if new_mails_w_attach:
            new_mails_w_attach.attachment_ids.check_access('read')

        return new_mails

    def write(self, vals):
        res = super().write(vals)
        if vals.get('attachment_ids'):
            self.attachment_ids.check_access('read')
        return res
