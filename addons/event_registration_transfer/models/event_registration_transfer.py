# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError


class EventRegistrationTransfer(models.Model):
    _name = 'event.registration.transfer'
    _description = "Event Ticket Transfer"
    _inherit = ['portal.mixin', 'mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc, id desc'

    name = fields.Char("Reference", required=True, readonly=True, copy=False, default=lambda self: _("New"))
    registration_id = fields.Many2one(
        'event.registration', string="Ticket", required=True, readonly=True,
        index=True, ondelete='cascade')
    event_id = fields.Many2one(related='registration_id.event_id', store=True, index=True)
    company_id = fields.Many2one(related='registration_id.company_id', store=True)
    sender_partner_id = fields.Many2one('res.partner', string="Sender", readonly=True, index=True)
    recipient_partner_id = fields.Many2one(
        'res.partner', string="Recipient", required=True, readonly=True, index=True)
    state = fields.Selection([
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('revoked', 'Revoked'),
        ('expired', 'Expired'),
        ('returned', 'Returned'),
    ], string="Status", required=True, default='pending', readonly=True, copy=False, tracking=True)
    expiry_datetime = fields.Datetime("Expires On", readonly=True, copy=False)
    accept_datetime = fields.Datetime("Accepted On", readonly=True, copy=False)
    # snapshot of the ticket before acceptance, restored if the ticket is returned
    previous_name = fields.Char("Previous Attendee Name", readonly=True, copy=False)
    previous_email = fields.Char("Previous Attendee Email", readonly=True, copy=False)
    previous_phone = fields.Char("Previous Attendee Phone", readonly=True, copy=False)
    previous_company_name = fields.Char("Previous Attendee Company", readonly=True, copy=False)
    previous_barcode = fields.Char("Voided Barcode", readonly=True, copy=False)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _("New")) == _("New"):
                vals['name'] = self.env['ir.sequence'].next_by_code('event.registration.transfer') or _("New")
        transfers = super().create(vals_list)
        transfers._portal_ensure_token()
        return transfers

    def _compute_access_url(self):
        super()._compute_access_url()
        for transfer in self:
            transfer.access_url = f'/event/transfer/{transfer.id}'

    # ------------------------------------------------------------
    # ACTIONS
    # ------------------------------------------------------------

    @api.model
    def _action_request(self, registration, recipient):
        """ Create a pending transfer of ``registration`` to ``recipient`` and
        send the acceptance link to the recipient. """
        registration._check_transfer_allowed()
        if recipient == registration.partner_id:
            raise UserError(_("This ticket already belongs to %(name)s.", name=recipient.name))
        transfer = self.with_context(mail_create_nosubscribe=True).create({
            'registration_id': registration.id,
            'sender_partner_id': registration.partner_id.id,
            'recipient_partner_id': recipient.id,
            'expiry_datetime': self._get_expiry_datetime(registration),
        })
        registration._message_log(body=_(
            "Transfer %(reference)s to %(recipient)s requested.",
            reference=transfer.name, recipient=recipient.display_name,
        ))
        transfer._send_mail('event_registration_transfer.mail_template_transfer_request')
        return transfer

    def action_accept(self):
        """ Reassign the ticket to the recipient and void its previous barcode. """
        self.ensure_one()
        self.lock_for_update()
        self._check_acceptable()
        registration = self.registration_id
        self.write({
            'state': 'accepted',
            'accept_datetime': fields.Datetime.now(),
            'previous_name': registration.name,
            'previous_email': registration.email,
            'previous_phone': registration.phone,
            'previous_company_name': registration.company_name,
            'previous_barcode': registration.barcode,
        })
        self._reassign_registration(registration._get_transfer_owner_values(self.recipient_partner_id))
        # answers belong to the previous attendee (dietary needs, sizes, ...)
        registration.registration_answer_ids.unlink()
        registration._message_log(body=_(
            "Ticket transferred from %(sender)s to %(recipient)s (transfer %(reference)s). "
            "The previous barcode is no longer valid.",
            sender=self.previous_name or self.sender_partner_id.display_name,
            recipient=self.recipient_partner_id.display_name,
            reference=self.name,
        ))
        self._send_mail('event_registration_transfer.mail_template_transfer_accepted')
        return True

    def action_revoke(self):
        pending = self.filtered(lambda t: t.state == 'pending')
        if pending != self:
            raise UserError(_("Only pending transfers can be revoked."))
        self.state = 'revoked'
        self.registration_id._message_log_batch(bodies={
            transfer.registration_id.id: _("Transfer %(reference)s revoked.", reference=transfer.name)
            for transfer in self
        })
        return True

    def action_return(self):
        """ Give the ticket back to the sender of an accepted transfer. """
        self.ensure_one()
        self.lock_for_update()
        registration = self.registration_id
        if registration.returnable_transfer_id != self:
            raise UserError(_("This ticket cannot be returned."))
        if registration.state != 'open':
            raise UserError(_("Only confirmed tickets can be returned."))
        if registration.transfer_deadline and fields.Datetime.now() >= registration.transfer_deadline:
            raise UserError(_("The transfer window for this event is closed."))
        self.state = 'returned'
        self._reassign_registration({
            'partner_id': self.sender_partner_id.id,
            'name': self.previous_name,
            'email': self.previous_email,
            'phone': self.previous_phone,
            'company_name': self.previous_company_name,
        })
        registration.registration_answer_ids.unlink()
        registration._message_log(body=_(
            "Ticket returned by %(recipient)s to its sender (transfer %(reference)s). "
            "The previous barcode is no longer valid.",
            recipient=self.recipient_partner_id.display_name,
            reference=self.name,
        ))
        self._send_mail('event_registration_transfer.mail_template_transfer_returned')
        return True

    # ------------------------------------------------------------
    # TOOLS
    # ------------------------------------------------------------

    @api.model
    def _get_expiry_datetime(self, registration):
        """ Pending transfers expire after the event validity, and in any case
        when the transfer window closes. """
        candidates = [registration.transfer_deadline]
        if registration.event_id.transfer_expiry_hours:
            candidates.append(fields.Datetime.now() + timedelta(hours=registration.event_id.transfer_expiry_hours))
        candidates = [dt for dt in candidates if dt]
        return min(candidates) if candidates else False

    def _check_acceptable(self):
        self.ensure_one()
        registration = self.registration_id
        if self.state != 'pending':
            raise UserError(_("This transfer is no longer valid."))
        if self.expiry_datetime and fields.Datetime.now() >= self.expiry_datetime:
            raise UserError(_("This transfer has expired. Please ask the sender for a new one."))
        if not registration.active or registration.state != 'open':
            raise UserError(_("This ticket is no longer valid."))
        if registration.partner_id != self.sender_partner_id:
            raise UserError(_("This ticket changed owner since the transfer was requested."))

    def _reassign_registration(self, values):
        """ Write the new owner on the ticket and issue a new barcode, then
        send the new badge to the new owner. """
        self.ensure_one()
        registration = self.registration_id
        registration.write({
            **values,
            'barcode': registration._get_random_barcode(),
        })
        template = self.env.ref('event.event_registration_mail_template_badge', raise_if_not_found=False)
        if template:
            template.send_mail(registration.id)

    def _send_mail(self, template_xmlid):
        template = self.env.ref(template_xmlid, raise_if_not_found=False)
        if not template:
            return
        for transfer in self:
            transfer.message_post_with_source(
                template,
                email_layout_xmlid='mail.mail_notification_light',
                subtype_xmlid='mail.mt_comment',
            )

    @api.model
    def _cron_expire_transfers(self):
        expired = self.search([
            ('state', '=', 'pending'),
            ('expiry_datetime', '<=', fields.Datetime.now()),
        ])
        if not expired:
            return
        expired.state = 'expired'
        expired.registration_id._message_log_batch(bodies={
            transfer.registration_id.id: _(
                "Transfer %(reference)s to %(recipient)s expired.",
                reference=transfer.name,
                recipient=transfer.recipient_partner_id.display_name,
            )
            for transfer in expired
        })
