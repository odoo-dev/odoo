# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch
from datetime import datetime, timedelta
from freezegun import freeze_time

from odoo import Command
from odoo.addons.mail.tests.common import MailCase
from odoo.addons.microsoft_calendar.utils.microsoft_calendar import MicrosoftCalendarService
from odoo.addons.microsoft_calendar.utils.microsoft_event import MicrosoftEvent
from odoo.addons.microsoft_calendar.models.res_users import ResUsers
from odoo.addons.microsoft_calendar.tests.common import TestCommon


class TestSyncOdoo2MicrosoftMail(TestCommon, MailCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = []
        for n in range(1, 4):
            user = cls.env['res.users'].create({
                'name': f'user{n}',
                'login': f'user{n}',
                'email': f'user{n}@odoo.com',
                'microsoft_calendar_rtoken': f'abc{n}',
                'microsoft_calendar_token': f'abc{n}',
                'microsoft_calendar_token_validity': datetime(9999, 12, 31),
            })
            user.res_users_settings_id.write({
                'microsoft_synchronization_stopped': False,
                'microsoft_calendar_sync_token': f'{n}_sync_token',
            })
            cls.users += [user]

    @freeze_time("2020-01-01")
    @patch.object(ResUsers, '_get_microsoft_calendar_token', lambda user: user.microsoft_calendar_token)
    def test_event_creation_for_user(self):
        """Check that either emails or synchronization happens correctly when creating an event for another user."""
        user_root = self.env.ref('base.user_root')
        self.assertFalse(user_root.microsoft_calendar_token)
        partner = self.env['res.partner'].create({'name': 'Jean-Luc', 'email': 'jean-luc@opoo.com'})
        event_values = {
            'name': 'Event',
            'need_sync_m': True,
            'start': datetime(2020, 1, 15, 8, 0),
            'stop': datetime(2020, 1, 15, 18, 0),
        }
        paused_sync_user = self.users[2]
        paused_sync_user.write({
            'email': 'ms.sync.paused@test.lan',
            'microsoft_synchronization_stopped': True,
            'name': 'Paused Microsoft Sync User',
            'login': 'ms_sync_paused_user',
        })
        self.assertTrue(paused_sync_user.microsoft_synchronization_stopped)
        for create_user, organizer, mail_notified_partners, attendee in [
            (user_root, self.users[0], partner + self.users[0].partner_id, partner),  # emulates online appointment with user 0
            (user_root, None, partner, partner),  # emulates online resource appointment
            (self.users[0], None, False, partner),
            (self.users[0], self.users[0], False, partner),
            (self.users[0], self.users[1], False, partner),
            # create user has paused sync and organizer can sync -> will not sync because of bug
            # only the organizer is notified as we don't notify the author (= create_user.partner_id) on creation
            (paused_sync_user, self.users[0], self.users[0].partner_id, paused_sync_user.partner_id),
        ]:
            with self.subTest(create_uid=create_user.name if create_user else None, user_id=organizer.name if organizer else None, attendee=attendee.name):
                with self.mock_mail_gateway(), patch.object(MicrosoftCalendarService, 'insert') as mock_insert:
                    mock_insert.return_value = ('1', '1')
                    self.env['calendar.event'].with_user(create_user).create({
                        **event_values,
                        'partner_ids': [(4, organizer.partner_id.id), (4, attendee.id)] if organizer else [(4, attendee.id)],
                        'user_id': organizer.id if organizer else False,
                    })
                    self.env.cr.postcommit.run()
                if not mail_notified_partners:
                    self.assertNotSentEmail()
                    mock_insert.assert_called_once()
                    self.assert_dict_equal(mock_insert.call_args[0][0]['organizer'], {
                        'emailAddress': {'address': organizer.email if organizer else '', 'name': organizer.name if organizer else ''}
                    })
                else:
                    mock_insert.assert_not_called()
                    for notified_partner in mail_notified_partners:
                        self.assertMailMail(notified_partner, 'sent', author=(organizer or create_user).partner_id)

    @freeze_time("2021-09-22")
    @patch.object(ResUsers, '_get_microsoft_calendar_token', lambda user: user.microsoft_calendar_token)
    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_no_invitation_email_on_recurrent_exception_from_outlook_sync(self, mock_get_events):
        """Invitation emails must not be sent when syncing a recurring event with exception occurrences from Outlook."""
        organizer = self.organizer_user
        organizer.write({
            'microsoft_calendar_token': 'test_token',
            'microsoft_calendar_token_validity': datetime(9999, 12, 31),
        })
        organizer_payload = {
            'emailAddress': {'address': organizer.email, 'name': organizer.display_name},
        }

        attendee = self.attendee_user
        attendees_payload = [
            {
                'type': 'required',
                'status': {'response': 'none', 'time': '0001-01-01T00:00:00Z'},
                'emailAddress': {'name': attendee.display_name, 'address': attendee.email},
            },
        ]

        common_fields = {
            'body': {'content': '', 'contentType': 'text'},
            'isAllDay': False, 'isCancelled': False, 'isOnlineMeeting': False,
            'isOrganizer': True, 'isReminderOn': False,
            'location': {'displayName': ''},
            'organizer': organizer_payload,
            'reminderMinutesBeforeStart': 0, 'responseRequested': True,
            'responseStatus': {'response': 'organizer', 'time': '0001-01-01T00:00:00Z'},
            'sensitivity': 'normal', 'showAs': 'busy',
            'attendees': attendees_payload,
        }

        series_start = datetime(2021, 9, 23, 13, 0)
        series_stop = datetime(2021, 9, 23, 14, 0)
        series_master = {
            **common_fields,
            'type': 'seriesMaster',
            'id': 'SERIES_MASTER_ID',
            'iCalUId': 'SERIES_MASTER_ICALUID',
            'seriesMasterId': None,
            'subject': 'Amakna',
            'start': {'dateTime': series_start.strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
            'end': {'dateTime': series_stop.strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
            'recurrence': {
                'pattern': {
                    'type': 'daily', 'interval': 14,
                    'dayOfMonth': 0, 'firstDayOfWeek': 'sunday', 'index': 'first', 'month': 0,
                },
                'range': {
                    'type': 'endDate',
                    'startDate': series_start.strftime('%Y-%m-%d'),
                    'endDate': (series_start + timedelta(days=42)).strftime('%Y-%m-%d'),
                    'numberOfOccurrences': 0, 'recurrenceTimeZone': 'UTC',
                },
            },
        }

        occ_start = series_start + timedelta(days=14)
        regular_occurrence = {
            **common_fields,
            'type': 'occurrence',
            'id': 'OCCURRENCE_ID_1',
            'iCalUId': 'OCCURRENCE_ICALUID_1',
            'seriesMasterId': 'SERIES_MASTER_ID',
            'subject': 'Amakna',
            'recurrence': None,
            'start': {'dateTime': occ_start.strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
            'end': {'dateTime': (occ_start + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
        }

        exc_start = series_start + timedelta(days=4)
        exception_occurrence = {
            **common_fields,
            'type': 'exception',
            'id': 'EXCEPTION_ID_1',
            'iCalUId': 'EXCEPTION_ICALUID_1',
            'seriesMasterId': 'SERIES_MASTER_ID',
            'subject': 'Amakna',
            'recurrence': None,
            'start': {'dateTime': exc_start.strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
            'end': {'dateTime': (exc_start + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
        }

        mock_get_events.return_value = (
            MicrosoftEvent([series_master, regular_occurrence, exception_occurrence]),
            None,
        )

        with self.mock_mail_gateway():
            organizer.with_user(organizer).sudo()._sync_microsoft_calendar()

        events = self.env['calendar.event'].search([('name', '=', 'Amakna')])
        self.assertTrue(all(e.microsoft_id for e in events), "All synced events must have microsoft_id set")
        self.assertNotSentEmail()

    def test_change_organizer_pure_odoo_event(self):
        """
        Test that changing organizer on a pure Odoo event (not synced with Microsoft)
        does not archive the event.
        """
        self.organizer_user.microsoft_synchronization_stopped = True
        event = self.env["calendar.event"].with_user(self.organizer_user).create({
            'name': "Pure Odoo Event",
            'start': datetime(2024, 1, 1, 10, 0),
            'stop': datetime(2024, 1, 1, 11, 0),
            'user_id': self.organizer_user.id,
            'partner_ids': [Command.set([self.organizer_user.partner_id.id, self.attendee_user.partner_id.id])],
        })

        self.assertFalse(event.microsoft_id)
        self.assertTrue(event.active)

        event.write({
            'user_id': self.attendee_user.id,
        })

        self.assertTrue(event.active, "Pure Odoo event should not be archived when changing organizer")
        self.assertEqual(event.user_id, self.attendee_user, "Organizer should be updated")
