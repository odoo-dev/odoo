from odoo import api, fields, models


class MailTestComposerMixin(models.Model):
    """ A simple invite-like wizard using the composer mixin, rendering on
    composer source test model. Purpose is to have a minimal composer which
    runs on other records and check notably dynamic template support and
    translations. """
    _description = 'Invite-like Wizard'
    _name = "mail.test.composer.mixin"
    _inherit = ['mail.composer.mixin']

    name = fields.Char('Name')
    author_id = fields.Many2one('res.partner')
    description = fields.Html('Description', render_engine="qweb", render_options={"post_process": True}, sanitize='email_outgoing')
    source_ids = fields.Many2many('mail.test.composer.source', string='Invite source')

    def _compute_render_model(self):
        self.render_model = 'mail.test.composer.source'


class MailTestComposerSource(models.Model):
    """ A simple model on which invites are sent. """
    _description = 'Invite-like Source'
    _name = "mail.test.composer.source"
    _inherit = ['mail.thread.blacklist']
    _primary_email = 'email_from'

    name = fields.Char('Name')
    customer_id = fields.Many2one('res.partner', 'Main customer')
    email_from = fields.Char(
        'Email',
        compute='_compute_email_from', readonly=False, store=True)

    @api.depends('customer_id')
    def _compute_email_from(self):
        for source in self.filtered(lambda r: r.customer_id and not r.email_from):
            source.email_from = source.customer_id.email_formatted

    def _mail_get_partner_fields(self, introspect_fields=False):
        return ['customer_id']
