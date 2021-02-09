# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, tools
from odoo.tools import exception_to_unicode
from odoo.tools.translate import _

import random
import logging
_logger = logging.getLogger(__name__)

_INTERVALS = {
    'hours': lambda interval: relativedelta(hours=interval),
    'days': lambda interval: relativedelta(days=interval),
    'weeks': lambda interval: relativedelta(days=7*interval),
    'months': lambda interval: relativedelta(months=interval),
    'now': lambda interval: relativedelta(hours=0),
}


class EventTypeMail(models.Model):
    """ Template of event.mail to attach to event.type. Those will be copied
    upon all events created in that type to ease event creation. """
    _name = 'event.type.mail'
    _description = 'Mail Scheduling on Event Category'

    event_type_id = fields.Many2one(
        'event.type', string='Event Type',
        ondelete='cascade', required=True)
    notification_type = fields.Selection([('mail', 'Mail')], string='Send', default='mail', required=True)
    interval_nbr = fields.Integer('Interval', default=1)
    interval_unit = fields.Selection([
        ('now', 'Immediately'),
        ('hours', 'Hours'), ('days', 'Days'),
        ('weeks', 'Weeks'), ('months', 'Months')],
        string='Unit', default='hours', required=True)
    interval_type = fields.Selection([
        ('after_sub', 'After each registration'),
        ('before_event', 'Before the event'),
        ('after_event', 'After the event')],
        string='Trigger', default="before_event", required=True)
    template_id = fields.Many2one(
        'mail.template', string='Email Template',
        domain=[('model', '=', 'event.registration')], ondelete='restrict',
        help='This field contains the template of the mail that will be automatically sent')

    @api.model
    def _get_event_mail_fields_whitelist(self):
        """ Whitelist of fields that are copied from event_type_mail_ids to event_mail_ids when
        changing the event_type_id field of event.event """
        return ['notification_type', 'template_id', 'interval_nbr', 'interval_unit', 'interval_type']


class EventMailScheduler(models.Model):
    """ Event automated mailing. This model replaces all existing fields and
    configuration allowing to send emails on events since Odoo 9. A cron exists
    that periodically checks for mailing to run. """
    _name = 'event.mail'
    _rec_name = 'event_id'
    _description = 'Event Automated Mailing'

    event_id = fields.Many2one('event.event', string='Event', required=True, ondelete='cascade')
    sequence = fields.Integer('Display order')
    notification_type = fields.Selection([('mail', 'Mail')], string='Send', default='mail', required=True)
    interval_nbr = fields.Integer('Interval', default=1)
    interval_unit = fields.Selection([
        ('now', 'Immediately'),
        ('hours', 'Hours'), ('days', 'Days'),
        ('weeks', 'Weeks'), ('months', 'Months')],
        string='Unit', default='hours', required=True)
    interval_type = fields.Selection([
        ('after_sub', 'After each registration'),
        ('before_event', 'Before the event'),
        ('after_event', 'After the event')],
        string='Trigger ', default="before_event", required=True)
    template_id = fields.Many2one(
        'mail.template', string='Email Template',
        domain=[('model', '=', 'event.registration')], ondelete='restrict',
        help='This field contains the template of the mail that will be automatically sent')
    scheduled_date = fields.Datetime('Schedule Date', compute='_compute_scheduled_date', store=True)
    # contact and status
    mail_registration_ids = fields.One2many(
        'event.mail.registration', 'scheduler_id',
        help='Communication related to event registrations')
    mail_registration_count_done = fields.Integer(
        '# Sent', copy=False, readonly=True,
        help='Number of sent communications related to event registrations')
    mail_registration_sent = fields.Boolean(
        'Mail Sent on Registrations', copy=False,
        help='Communication sent on all registrations')
    event_mail_sent = fields.Boolean(
        'Mail Sent on Event', copy=False,
        help='Event-related communication sent')
    mail_state = fields.Selection(
        [('running', 'Running'), ('scheduled', 'Scheduled'), ('sent', 'Sent')],
        string='Global communication Status', compute='_compute_mail_state'
    )

    @api.depends('event_id.date_begin', 'event_id.date_end', 'interval_type', 'interval_unit', 'interval_nbr')
    def _compute_scheduled_date(self):
        for scheduler in self:
            if scheduler.interval_type == 'after_sub':
                date, sign = scheduler.event_id.create_date, 1
            elif scheduler.interval_type == 'before_event':
                date, sign = scheduler.event_id.date_begin, -1
            else:
                date, sign = scheduler.event_id.date_end, 1

            scheduler.scheduled_date = date + _INTERVALS[scheduler.interval_unit](sign * scheduler.interval_nbr) if date else False

    @api.depends('interval_type', 'scheduled_date', 'event_mail_sent')
    def _compute_mail_state(self):
        for scheduler in self:
            # registrations based
            if scheduler.interval_type == 'after_sub':
                scheduler.mail_state = 'running'
            # global event based
            elif scheduler.event_mail_sent:
                scheduler.mail_state = 'sent'
            elif scheduler.scheduled_date:
                scheduler.mail_state = 'scheduled'
            else:
                scheduler.mail_state = 'running'

    def _compute_field_value(self, field):
        """ When updating ``scheduled_date`` prepare a cron trigger so that
        we effectively send emails when scheduled. Exclude onchange-like
        computation, therefore filtering on ``id``. """
        updated = self.filtered(
            lambda scheduler: scheduler.id and scheduler.interval_type != 'after_sub'
        ) if field.name == 'scheduled_date' else False
        pre_values = updated.mapped('scheduled_date') if updated else []

        super(EventMailScheduler, self)._compute_field_value(field)

        new_values = [
            val for val in updated.mapped('scheduled_date')
            if val and val not in pre_values
        ] if updated else []
        if new_values:
            schedule_cron = self.env.ref('event.event_mail_scheduler', raise_if_not_found=False)
            if schedule_cron:
                schedule_cron._trigger(at=new_values)

    def execute(self):
        for scheduler in self:
            now = fields.Datetime.now()
            if scheduler.interval_type == 'after_sub':
                new_registrations = scheduler.event_id.registration_ids.filtered_domain(
                    [('state', 'not in', ('cancel', 'draft'))]
                ) - scheduler.mail_registration_ids.registration_id
                scheduler._create_missing_mail_registrations(new_registrations)

                # execute scheduler on registrations
                scheduler.mail_registration_ids.filtered(lambda reg: not reg.mail_sent and reg.scheduled_date and reg.scheduled_date <= now).execute()
                total_sent = len(scheduler.mail_registration_ids.filtered(lambda reg: reg.mail_sent))
                scheduler.update({
                    'mail_registration_count_done': total_sent,
                    'mail_registration_sent': total_sent >= (scheduler.event_id.seats_reserved + scheduler.event_id.seats_used),
                })
            else:
                # before or after event -> one shot email
                if scheduler.event_mail_sent or scheduler.notification_type != 'mail':
                    continue
                # do not send emails if the mailing was scheduled before the event but the event is over
                if scheduler.interval_type == 'after_event' or scheduler.event_id.date_end > now:
                    scheduler.event_id.mail_attendees(scheduler.template_id.id)
                    scheduler.update({
                        'event_mail_sent': True,
                        'mail_registration_count_done': scheduler.event_id.seats_reserved + scheduler.event_id.seats_used,
                    })
        return True

    def _create_missing_mail_registrations(self, registrations):
        new = []
        for scheduler in self:
            new += [{
                'registration_id': registration.id,
                'scheduler_id': scheduler.id,
            } for registration in registrations]
        if new:
            return self.env['event.mail.registration'].create(new)
        return self.env['event.mail.registration']

    @api.model
    def _warn_template_error(self, scheduler, exception):
        # We warn ~ once by hour ~ instead of every 10 min if the interval unit is more than 'hours'.
        if random.random() < 0.1666 or scheduler.interval_unit in ('now', 'hours'):
            ex_s = exception_to_unicode(exception)
            try:
                event, template = scheduler.event_id, scheduler.template_id
                emails = list(set([event.organizer_id.email, event.user_id.email, template.write_uid.email]))
                subject = _("WARNING: Event Scheduler Error for event: %s", event.name)
                body = _("""Event Scheduler for:
  - Event: %(event_name)s (%(event_id)s)
  - Scheduled: %(date)s
  - Template: %(template_name)s (%(template_id)s)

Failed with error:
  - %(error)s

You receive this email because you are:
  - the organizer of the event,
  - or the responsible of the event,
  - or the last writer of the template.
""",
                         event_name=event.name,
                         event_id=event.id,
                         date=scheduler.scheduled_date,
                         template_name=template.name,
                         template_id=template.id,
                         error=ex_s)
                email = self.env['ir.mail_server'].build_email(
                    email_from=self.env.user.email,
                    email_to=emails,
                    subject=subject, body=body,
                )
                self.env['ir.mail_server'].send_email(email)
            except Exception as e:
                _logger.error("Exception while sending traceback by email: %s.\n Original Traceback:\n%s", e, exception)
                pass

    @api.model
    def run(self, autocommit=False):
        """ Backward compatible method, notably if crons are not updated when
        migrating for some reason. """
        return self.schedule_communications(autocommit=autocommit)

    def schedule_communications(self, autocommit=False):
        schedulers = self.search([
            '&', '|',
            '&', ('interval_type', '=', 'after_sub'), ('mail_registration_sent', '=', False),
            ('event_mail_sent', '=', False),
            ('scheduled_date', '<=', fields.Datetime.now())
        ])
        for scheduler in schedulers:
            try:
                with self.env.cr.savepoint():
                    # Prevent a mega prefetch of the registration ids of all the events of all the schedulers
                    self.browse(scheduler.id).execute()
            except Exception as e:
                _logger.exception(e)
                self.invalidate_cache()
                self._warn_template_error(scheduler, e)
            else:
                if autocommit:
                    self.env.cr.commit()
        return True


class EventMailRegistration(models.Model):
    _name = 'event.mail.registration'
    _description = 'Registration Mail Scheduler'
    _rec_name = 'scheduler_id'
    _order = 'scheduled_date DESC'

    scheduler_id = fields.Many2one('event.mail', 'Mail Scheduler', required=True, ondelete='cascade')
    registration_id = fields.Many2one('event.registration', 'Attendee', required=True, ondelete='cascade')
    scheduled_date = fields.Datetime('Scheduled Time', compute='_compute_scheduled_date', store=True)
    mail_sent = fields.Boolean('Mail Sent')

    def _compute_field_value(self, field):
        """ When updating ``scheduled_date`` prepare a cron trigger so that
        we effectively send emails when scheduled. Exclude onchange-like
        computation, therefore filtering on ``id``. """
        updated = self.filtered('id') if field.name == 'scheduled_date' else False
        pre_values = updated.mapped('scheduled_date') if updated else []

        super(EventMailRegistration, self)._compute_field_value(field)

        new_values = [
            val for val in updated.mapped('scheduled_date')
            if val and val not in pre_values
        ] if updated else []
        if new_values:
            schedule_cron = self.env.ref('event.event_mail_scheduler', raise_if_not_found=False)
            if schedule_cron:
                schedule_cron._trigger(at=new_values)

    def execute(self):
        for mail in self:
            if mail.registration_id.state in ['open', 'done'] and not mail.mail_sent and mail.scheduler_id.notification_type == 'mail':
                mail.scheduler_id.template_id.send_mail(mail.registration_id.id)
                mail.write({'mail_sent': True})

    @api.depends('registration_id', 'scheduler_id.interval_unit', 'scheduler_id.interval_type')
    def _compute_scheduled_date(self):
        for mail in self:
            if mail.registration_id:
                date_open = mail.registration_id.date_open
                date_open_datetime = date_open or fields.Datetime.now()
                mail.scheduled_date = date_open_datetime + _INTERVALS[mail.scheduler_id.interval_unit](mail.scheduler_id.interval_nbr)
            else:
                mail.scheduled_date = False
