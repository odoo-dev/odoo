# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from datetime import timedelta, datetime
from dateutil.relativedelta import relativedelta
from pytz import UTC

from odoo import api, fields, models
from markupsafe import Markup

_logger = logging.getLogger(__name__)


class AlarmManager(models.AbstractModel):
    _name = 'calendar.alarm_manager'
    _description = 'Event Alarm Manager'

    def _get_next_potential_limit_alarm(self, alarm_type, seconds=None, partners=None):
        # flush models before making queries
        for model_name in ('calendar.alarm', 'calendar.event', 'calendar.recurrence'):
            self.env[model_name].flush_model()

        result = {}
        delta_request = """
            SELECT
                rel.calendar_event_id, max(alarm.duration_minutes) AS max_delta,min(alarm.duration_minutes) AS min_delta
            FROM
                calendar_alarm_calendar_event_rel AS rel
            LEFT JOIN calendar_alarm AS alarm ON alarm.id = rel.calendar_alarm_id
            WHERE alarm.alarm_type = %s
            GROUP BY rel.calendar_event_id
        """
        base_request = """
                    SELECT
                        cal.id,
                        cal.start - interval '1' minute  * calcul_delta.max_delta AS first_alarm,
                        CASE
                            WHEN cal.recurrency THEN rrule.until - interval '1' minute  * calcul_delta.min_delta
                            ELSE cal.stop - interval '1' minute  * calcul_delta.min_delta
                        END as last_alarm,
                        cal.start as first_event_date,
                        CASE
                            WHEN cal.recurrency THEN rrule.until
                            ELSE cal.stop
                        END as last_event_date,
                        calcul_delta.min_delta,
                        calcul_delta.max_delta,
                        rrule.rrule AS rule
                    FROM
                        calendar_event AS cal
                    RIGHT JOIN calcul_delta ON calcul_delta.calendar_event_id = cal.id
                    LEFT JOIN calendar_recurrence as rrule ON rrule.id = cal.recurrence_id
             """

        filter_user = """
                RIGHT JOIN calendar_event_res_partner_rel AS part_rel ON part_rel.calendar_event_id = cal.id
                    AND part_rel.res_partner_id IN %s
        """

        # Add filter on alarm type
        tuple_params = (alarm_type,)

        # Add filter on partner_id
        if partners:
            base_request += filter_user
            tuple_params += (tuple(partners.ids), )

        # Upper bound on first_alarm of requested events
        first_alarm_max_value = ""
        if seconds is None:
            # first alarm in the future + 3 minutes if there is one, now otherwise
            first_alarm_max_value = """
                COALESCE((SELECT MIN(cal.start - interval '1' minute  * calcul_delta.max_delta)
                FROM calendar_event cal
                RIGHT JOIN calcul_delta ON calcul_delta.calendar_event_id = cal.id
                WHERE cal.start - interval '1' minute  * calcul_delta.max_delta > now() at time zone 'utc'
            ) + interval '3' minute, now() at time zone 'utc')"""
        else:
            # now + given seconds
            first_alarm_max_value = "(now() at time zone 'utc' + interval '%s' second )"
            tuple_params += (seconds,)

        self.env.flush_all()
        self._cr.execute("""
            WITH calcul_delta AS (%s)
            SELECT *
                FROM ( %s WHERE cal.active = True ) AS ALL_EVENTS
               WHERE ALL_EVENTS.first_alarm < %s
                 AND ALL_EVENTS.last_event_date > (now() at time zone 'utc')
        """ % (delta_request, base_request, first_alarm_max_value), tuple_params)

        for event_id, first_alarm, last_alarm, first_meeting, last_meeting, min_duration, max_duration, rule in self._cr.fetchall():
            result[event_id] = {
                'event_id': event_id,
                'first_alarm': first_alarm,
                'last_alarm': last_alarm,
                'first_meeting': first_meeting,
                'last_meeting': last_meeting,
                'min_duration': min_duration,
                'max_duration': max_duration,
                'rrule': rule
            }

        # determine accessible events
        events = self.env['calendar.event'].browse(result)
        result = {
            key: result[key]
            for key in set(events._filter_access_rules('read').ids)
        }
        return result

    def do_check_alarm_for_one_date(self, one_date, event, event_maxdelta, in_the_next_X_seconds, alarm_type, after=False, missing=False):
        """ Search for some alarms in the interval of time determined by some parameters (after, in_the_next_X_seconds, ...)
            :param one_date: date of the event to check (not the same that in the event browse if recurrent)
            :param event: Event browse record
            :param event_maxdelta: biggest duration from alarms for this event
            :param in_the_next_X_seconds: looking in the future (in seconds)
            :param after: if not False: will return alert if after this date (date as string - todo: change in master)
            :param missing: if not False: will return alert even if we are too late
            :param notif: Looking for type notification
            :param mail: looking for type email
        """
        result = []
        # TODO: remove event_maxdelta and if using it
        past = one_date - timedelta(minutes=(missing * event_maxdelta))
        future = fields.Datetime.now() + timedelta(seconds=in_the_next_X_seconds)
        if future <= past:
            return result
        for alarm in event.alarm_ids:
            if alarm.alarm_type != alarm_type:
                continue
            past = one_date - timedelta(minutes=(missing * alarm.duration_minutes))
            if future <= past:
                continue
            if after and past <= fields.Datetime.from_string(after):
                continue
            result.append({
                'alarm_id': alarm.id,
                'event_id': event.id,
                'notify_at': one_date - timedelta(minutes=alarm.duration_minutes),
            })
        return result

    def _get_events_by_alarm_to_notify(self, alarm_type):
        """
        Get the events with an alarm of the given type between the cron
        last call and now.

        Please note that all new reminders created since the cron last
        call with an alarm prior to the cron last call are skipped by
        design. The attendees receive an invitation for any new event
        already.
        """
        lastcall = self.env.context.get('lastcall', False) or fields.date.today() - relativedelta(weeks=1)
        now = datetime.now(tz=UTC)
        self.env.cr.execute('''
            SELECT "alarm"."id", "event"."id"
              FROM "calendar_event" AS "event"
              JOIN "calendar_alarm_calendar_event_rel" AS "event_alarm_rel"
                ON "event"."id" = "event_alarm_rel"."calendar_event_id"
              JOIN "calendar_alarm" AS "alarm"
                ON "event_alarm_rel"."calendar_alarm_id" = "alarm"."id"
             WHERE (
                   "alarm"."alarm_type" in %s
               AND "event"."active"
               AND "event"."start" - CAST("alarm"."duration" || ' ' || "alarm"."interval" AS Interval) >= %s
               AND "event"."start" - CAST("alarm"."duration" || ' ' || "alarm"."interval" AS Interval) < %s
             )''', [tuple(alarm_type), lastcall, now])

        events_by_alarm = {}
        for alarm_id, event_id in self.env.cr.fetchall():
            events_by_alarm.setdefault(alarm_id, list()).append(event_id)
        return events_by_alarm

    @api.model
    def _send_reminder(self):
        # Executed via cron
        events_by_alarm = self._get_events_by_alarm_to_notify(['email', 'notification'])
        if not events_by_alarm:
            return

        event_ids = list(set(event_id for event_ids in events_by_alarm.values() for event_id in event_ids))
        events = self.env['calendar.event'].browse(event_ids)
        attendees = events.attendee_ids.filtered(lambda a: a.state != 'declined')
        alarms = self.env['calendar.alarm'].browse(events_by_alarm.keys())
        notifications = []
        for alarm in alarms:
            if alarm.alarm_type == 'notification':
                for event_id in events_by_alarm[alarm.id]:
                    event = events.browse(event_id)
                    notifications += self._get_alarm_notifications(alarm, event)
            if alarm.alarm_type == 'email':
                alarm_attendees = attendees.filtered(lambda attendee: attendee.event_id.id in events_by_alarm[alarm.id])
                alarm_attendees.with_context(
                    calendar_template_ignore_recurrence=True
                )._send_mail_to_attendees(
                    alarm.mail_template_id,
                    force_send=True
                )

        if notifications:
            self.env['bus.bus']._sendmany(notifications)

        for event in events:
            if event.recurrence_id:
                next_date = event.get_next_alarm_date(events_by_alarm)
                event.recurrence_id.with_context(date=next_date)._setup_alarms()

    @api.model
    def _get_alarm_notifications(self, alarm, event):
        notifications = []
        message = event.display_time
        if alarm.body:
            message += Markup('<p>%s</p>') % alarm.body
        notif = {
            'event_id': event.id,
            'title': event.name,
            'message': message,
        }
        for partner in event.attendee_ids.partner_id:
            notifications.append([partner, 'calendar.alarm', notif])
        return notifications
