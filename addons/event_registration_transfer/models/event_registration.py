# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import email_normalize


class EventRegistration(models.Model):
    _inherit = 'event.registration'

    transfer_ids = fields.One2many('event.registration.transfer', 'registration_id', string="Transfers")
    transfer_count = fields.Integer("Transfer Count", compute='_compute_transfer_count')
    pending_transfer_id = fields.Many2one(
        'event.registration.transfer', string="Pending Transfer", compute='_compute_transfer_status')
    returnable_transfer_id = fields.Many2one(
        'event.registration.transfer', string="Returnable Transfer", compute='_compute_transfer_status',
        help="Accepted transfer the current owner may give back to its sender.")
    transfer_deadline = fields.Datetime("Transfer Deadline", compute='_compute_transfer_deadline')
    is_transfer_allowed = fields.Boolean("Can Be Transferred", compute='_compute_is_transfer_allowed')

    @api.depends('transfer_ids')
    def _compute_transfer_count(self):
        for registration in self:
            registration.transfer_count = len(registration.transfer_ids)

    @api.depends('transfer_ids.state', 'event_id.allow_transfer_return')
    def _compute_transfer_status(self):
        for registration in self:
            transfers = registration.transfer_ids.sorted('id', reverse=True)
            registration.pending_transfer_id = transfers.filtered(lambda t: t.state == 'pending')[:1]
            # only the latest completed transfer can be returned, so that ownership unwinds in order
            last_completed = transfers.filtered(lambda t: t.state in ('accepted', 'returned'))[:1]
            registration.returnable_transfer_id = (
                last_completed
                if last_completed.state == 'accepted' and registration.event_id.allow_transfer_return
                else False
            )

    @api.depends('event_begin_date', 'event_id.transfer_deadline_hours')
    def _compute_transfer_deadline(self):
        for registration in self:
            begin = registration.event_begin_date
            registration.transfer_deadline = (
                begin - timedelta(hours=registration.event_id.transfer_deadline_hours)
                if begin else False
            )

    @api.depends('state', 'active', 'transfer_deadline', 'transfer_ids.state',
                 'event_id.allow_transfer', 'event_id.transfer_limit')
    def _compute_is_transfer_allowed(self):
        for registration in self:
            registration.is_transfer_allowed = not registration._get_transfer_blocking_reason()

    # ------------------------------------------------------------
    # ACTIONS
    # ------------------------------------------------------------

    def action_open_transfer_wizard(self):
        self.ensure_one()
        self._check_transfer_allowed()
        return {
            'name': _("Transfer Ticket"),
            'type': 'ir.actions.act_window',
            'res_model': 'event.registration.transfer.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_registration_id': self.id},
        }

    def action_view_transfers(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id(
            'event_registration_transfer.event_registration_transfer_action')
        action['domain'] = [('registration_id', '=', self.id)]
        action['context'] = {'default_registration_id': self.id}
        return action

    # ------------------------------------------------------------
    # TRANSFER TOOLS
    # ------------------------------------------------------------

    def _get_transfer_blocking_reason(self):
        """ Return a message explaining why this registration cannot be
        transferred, or ``False`` if it can be. """
        self.ensure_one()
        event = self.event_id
        if not event.allow_transfer:
            return _("The organizer does not allow ticket transfers for this event.")
        if not self.active or self.state != 'open':
            return _("Only confirmed tickets can be transferred.")
        if self.transfer_deadline and fields.Datetime.now() >= self.transfer_deadline:
            return _("The transfer window for this event is closed.")
        if self.pending_transfer_id:
            return _("A transfer is already pending for this ticket.")
        if event.transfer_limit and self._get_completed_transfer_count() >= event.transfer_limit:
            return _(
                "This ticket has reached the maximum number of allowed transfers (%(limit)s).",
                limit=event.transfer_limit,
            )
        return False

    def _check_transfer_allowed(self):
        for registration in self:
            if reason := registration._get_transfer_blocking_reason():
                raise UserError(reason)

    def _get_completed_transfer_count(self):
        """ Returned transfers are counted too, so that a ticket cannot bounce
        back and forth between two attendees forever. """
        self.ensure_one()
        return len(self.transfer_ids.filtered(lambda t: t.state in ('accepted', 'returned')))

    def _find_transfer_recipient(self, email_or_phone):
        """ Find the contact matching an email or a phone number given by the
        sender of a transfer. Partners linked to a user are preferred, as they
        can then manage the ticket from their portal.

        :param str email_or_phone: email address or phone number of the recipient
        :return: matching ``res.partner`` (sudo-ed)
        :raise UserError: if no contact or only the current owner matches
        """
        self.ensure_one()
        value = (email_or_phone or '').strip()
        if not value:
            raise UserError(_("Please enter the email or phone number of the recipient."))

        Partner = self.env['res.partner'].sudo()
        if email := email_normalize(value):
            domain = [('email_normalized', '=', email)]
        else:
            country = self.partner_id.country_id or self.event_id.country_id
            sanitized = Partner._phone_format(number=value, country=country)
            domain = [('phone_mobile_search', '=', value)]
            if sanitized:
                domain = ['|', ('phone_sanitized', '=', sanitized)] + domain
        partners = Partner.search(domain).filtered(lambda p: p != self.partner_id)
        if not partners:
            raise UserError(_("No contact matches \"%(value)s\".", value=value))
        return partners.sorted(lambda p: (not p.user_ids, p.id))[:1]

    def _get_transfer_owner_values(self, partner):
        """ Attendee values to write on the registration when ``partner``
        becomes its owner. Values missing on the partner are reset, so that no
        information of the previous owner remains on the ticket. """
        self.ensure_one()
        return {
            'partner_id': partner.id,
            'name': False,
            'email': False,
            'phone': False,
            **self._synchronize_partner_values(partner, fnames={'name', 'email', 'phone'}),
            'company_name': partner.commercial_company_name or False,
        }
