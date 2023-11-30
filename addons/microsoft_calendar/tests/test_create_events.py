from datetime import datetime, timedelta
from unittest.mock import patch

from odoo import Command
from odoo import fields

from odoo.addons.microsoft_calendar.utils.microsoft_calendar import MicrosoftCalendarService
from odoo.addons.microsoft_calendar.utils.microsoft_event import MicrosoftEvent
from odoo.addons.microsoft_calendar.models.res_users import User
from odoo.addons.microsoft_calendar.tests.common import TestCommon, mock_get_token
from odoo.exceptions import ValidationError, UserError

@patch.object(User, '_get_microsoft_calendar_token', mock_get_token)
class TestCreateEvents(TestCommon):

    @patch.object(MicrosoftCalendarService, 'insert')
    def test_create_simple_event_without_sync(self, mock_insert):
        """
        A Odoo event is created when Outlook sync is not enabled.
        """

        # arrange
        self.organizer_user.microsoft_synchronization_stopped = True

        # act
        record = self.env["calendar.event"].with_user(self.organizer_user).create(self.simple_event_values)
        self.call_post_commit_hooks()
        record.invalidate_recordset()

        # assert
        mock_insert.assert_not_called()
        self.assertEqual(record.need_sync_m, False)

    def test_create_simple_event_without_email(self):
        """
        Outlook does not accept attendees without email.
        """
        # arrange
        self.attendee_user.partner_id.email = False

        # act & assert
        record = self.env["calendar.event"].with_user(self.organizer_user).create(self.simple_event_values)

        with self.assertRaises(ValidationError):
            record._sync_odoo2microsoft()

    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_create_simple_event_from_outlook_organizer_calendar(self, mock_get_events):
        """
        An event has been created in Outlook and synced in the Odoo organizer calendar.
        """

        # arrange
        mock_get_events.return_value = (MicrosoftEvent([self.simple_event_from_outlook_organizer]), None)
        existing_records = self.env["calendar.event"].search([])

        # act
        self.organizer_user.with_user(self.organizer_user).sudo()._sync_microsoft_calendar()

        # assert
        records = self.env["calendar.event"].search([])
        new_records = (records - existing_records)
        self.assertEqual(len(new_records), 1)
        self.assert_odoo_event(new_records, self.expected_odoo_event_from_outlook)
        self.assertEqual(new_records.user_id, self.organizer_user)
        self.assertEqual(new_records.need_sync_m, False)

    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_create_simple_event_from_outlook_attendee_calendar_and_organizer_exists_in_odoo(self, mock_get_events):
        """
        An event has been created in Outlook and synced in the Odoo attendee calendar.
        There is a Odoo user that matches with the organizer email address.
        """

        # arrange
        mock_get_events.return_value = (MicrosoftEvent([self.simple_event_from_outlook_attendee]), None)
        existing_records = self.env["calendar.event"].search([])

        # act
        self.organizer_user.with_user(self.organizer_user).sudo()._sync_microsoft_calendar()

        # assert
        records = self.env["calendar.event"].search([])
        new_records = (records - existing_records)
        self.assertEqual(len(new_records), 1)
        self.assert_odoo_event(new_records, self.expected_odoo_event_from_outlook)
        self.assertEqual(new_records.user_id, self.organizer_user)

    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_create_simple_event_from_outlook_attendee_calendar_and_organizer_does_not_exist_in_odoo(self, mock_get_events):
        """
        An event has been created in Outlook and synced in the Odoo attendee calendar.
        no Odoo user that matches with the organizer email address.
        """

        # arrange
        outlook_event = self.simple_event_from_outlook_attendee
        outlook_event = dict(self.simple_event_from_outlook_attendee, organizer={
            'emailAddress': {'address': "john.doe@odoo.com", 'name': "John Doe"},
        })
        expected_event = dict(self.expected_odoo_event_from_outlook, user_id=False)

        mock_get_events.return_value = (MicrosoftEvent([outlook_event]), None)
        existing_records = self.env["calendar.event"].search([])

        # act
        self.organizer_user.with_user(self.organizer_user).sudo()._sync_microsoft_calendar()

        # assert
        records = self.env["calendar.event"].search([])
        new_records = (records - existing_records)
        self.assertEqual(len(new_records), 1)
        self.assert_odoo_event(new_records, expected_event)

    @patch.object(MicrosoftCalendarService, 'insert')
    def test_create_recurrent_event_without_sync(self, mock_insert):
        """
        A Odoo recurrent event is created when Outlook sync is not enabled.
        """
        if not self.sync_odoo_recurrences_with_outlook_feature():
            return

        # arrange
        self.organizer_user.microsoft_synchronization_stopped = True

        # act
        record = self.env["calendar.event"].with_user(self.organizer_user).create(self.recurrent_event_values)
        self.call_post_commit_hooks()
        record.invalidate_recordset()

        # assert
        mock_insert.assert_not_called()
        self.assertEqual(record.need_sync_m, False)

    @patch.object(MicrosoftCalendarService, 'get_events')
    @patch.object(MicrosoftCalendarService, 'insert')
    def test_create_recurrent_event_with_sync(self, mock_insert, mock_get_events):
        """
        A Odoo recurrent event is created when Outlook sync is enabled.
        """
        if not self.sync_odoo_recurrences_with_outlook_feature():
            return

        # >>> first phase: create the recurrence

        # act
        record = self.env["calendar.event"].with_user(self.organizer_user).create(self.recurrent_event_values)

        # assert
        recurrence = self.env["calendar.recurrence"].search([("base_event_id", "=", record.id)])

        mock_insert.assert_not_called()
        self.assertEqual(record.name, "recurring_event")
        self.assertEqual(recurrence.name, "Every 2 Days for 7 events")
        self.assertEqual(len(recurrence.calendar_event_ids), 7)

        # >>> second phase: sync with organizer outlook calendar

        # arrange
        event_id = "123"
        event_iCalUId = "456"
        mock_insert.return_value = (event_id, event_iCalUId)
        mock_get_events.return_value = ([], None)

        # act
        self.organizer_user.with_user(self.organizer_user).sudo()._sync_microsoft_calendar()
        self.call_post_commit_hooks()
        recurrence.invalidate_recordset()

        # assert
        self.assertEqual(recurrence.ms_organizer_event_id, event_id)
        self.assertEqual(recurrence.ms_universal_event_id, event_iCalUId)
        self.assertEqual(recurrence.need_sync_m, False)

        mock_insert.assert_called_once()
        self.assert_dict_equal(mock_insert.call_args[0][0], self.recurrent_event_ms_values)

    @patch.object(MicrosoftCalendarService, 'get_events')
    @patch.object(MicrosoftCalendarService, 'insert')
    def test_create_recurrent_event_with_sync_by_another_user(self, mock_insert, mock_get_events):
        """
        A Odoo recurrent event has been created and synced with Outlook by another user, but nothing
        should happen as it we prevent sync of recurrences from other users
        ( see microsoft_calendar/models/calendar_recurrence_rule.py::_get_microsoft_sync_domain() )
        """
        if not self.sync_odoo_recurrences_with_outlook_feature():
            return
        # >>> first phase: create the recurrence

        # act
        record = self.env["calendar.event"].with_user(self.organizer_user).create(self.recurrent_event_values)

        # assert
        recurrence = self.env["calendar.recurrence"].search([("base_event_id", "=", record.id)])

        mock_insert.assert_not_called()
        self.assertEqual(record.name, "recurring_event")
        self.assertEqual(recurrence.name, f"Every 2 Days for {self.recurrent_events_count} events")
        self.assertEqual(len(recurrence.calendar_event_ids), self.recurrent_events_count)

        # >>> second phase: sync with attendee Outlook calendar

        # arrange
        event_id = "123"
        event_iCalUId = "456"
        mock_insert.return_value = (event_id, event_iCalUId)
        mock_get_events.return_value = ([], None)

        # act
        self.attendee_user.with_user(self.attendee_user).sudo()._sync_microsoft_calendar()
        self.call_post_commit_hooks()
        recurrence.invalidate_recordset()

        # assert
        mock_insert.assert_not_called()

        self.assertEqual(recurrence.ms_organizer_event_id, False)
        self.assertEqual(recurrence.ms_universal_event_id, False)
        self.assertEqual(recurrence.need_sync_m, False)

    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_create_recurrent_event_from_outlook_organizer_calendar(self, mock_get_events):
        """
        A recurrent event has been created in Outlook and synced in the Odoo organizer calendar.
        """

        # arrange
        mock_get_events.return_value = (MicrosoftEvent(self.recurrent_event_from_outlook_organizer), None)
        existing_events = self.env["calendar.event"].search([])
        existing_recurrences = self.env["calendar.recurrence"].search([])

        # act
        self.organizer_user.with_user(self.organizer_user).sudo()._sync_microsoft_calendar()

        # assert
        new_events = (self.env["calendar.event"].search([]) - existing_events)
        new_recurrences = (self.env["calendar.recurrence"].search([]) - existing_recurrences)
        self.assertEqual(len(new_recurrences), 1)
        self.assertEqual(len(new_events), self.recurrent_events_count)
        self.assert_odoo_recurrence(new_recurrences, self.expected_odoo_recurrency_from_outlook)
        for i, e in enumerate(sorted(new_events, key=lambda e: e.id)):
            self.assert_odoo_event(e, self.expected_odoo_recurrency_events_from_outlook[i])

    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_create_recurrent_event_from_outlook_attendee_calendar(self, mock_get_events):
        """
        A recurrent event has been created in Outlook and synced in the Odoo attendee calendar.
        """

        # arrange
        mock_get_events.return_value = (MicrosoftEvent(self.recurrent_event_from_outlook_attendee), None)
        existing_events = self.env["calendar.event"].search([])
        existing_recurrences = self.env["calendar.recurrence"].search([])

        # act
        self.attendee_user.with_user(self.attendee_user).sudo()._sync_microsoft_calendar()

        # assert
        new_events = (self.env["calendar.event"].search([]) - existing_events)
        new_recurrences = (self.env["calendar.recurrence"].search([]) - existing_recurrences)
        self.assertEqual(len(new_recurrences), 1)
        self.assertEqual(len(new_events), self.recurrent_events_count)
        self.assert_odoo_recurrence(new_recurrences, self.expected_odoo_recurrency_from_outlook)
        for i, e in enumerate(sorted(new_events, key=lambda e: e.id)):
            self.assert_odoo_event(e, self.expected_odoo_recurrency_events_from_outlook[i])

    @patch.object(MicrosoftCalendarService, 'insert')
    def test_forbid_recurrences_creation_synced_outlook_calendar(self, mock_insert):
        """
        Forbids new recurrences creation in Odoo due to Outlook spam limitation of updating recurrent events.
        """
        # Set custom calendar token validity to simulate real scenario.
        self.env.user.microsoft_calendar_token_validity = datetime.now() + timedelta(minutes=5)

        # Assert that synchronization with Outlook is active.
        self.assertFalse(self.env.user.microsoft_synchronization_stopped)

        with self.assertRaises(UserError):
            self.env["calendar.event"].create(
                self.recurrent_event_values
            )
        # Assert that no insert call was made.
        mock_insert.assert_not_called()

    @patch.object(MicrosoftCalendarService, 'get_events')
    @patch.object(MicrosoftCalendarService, 'insert')
    def test_create_event_for_another_user(self, mock_insert, mock_get_events):
        """
        Allow the creation of event for another user only if the proposed user have its Odoo Calendar synced.
        User A (self.organizer_user) is creating an event with user B as organizer (self.attendee_user).
        """
        # Ensure that the calendar synchronization of user A is active. Deactivate user B synchronization for throwing an error.
        self.assertTrue(self.env['calendar.event'].with_user(self.organizer_user)._check_microsoft_sync_status())
        self.attendee_user.microsoft_synchronization_stopped = True

        # Try creating an event with the organizer as the user B (self.attendee_user).
        # A ValidationError must be thrown because user B's calendar is not synced.
        self.simple_event_values['user_id'] = self.attendee_user.id
        self.simple_event_values['partner_ids'] = [Command.set([self.organizer_user.partner_id.id])]
        with self.assertRaises(ValidationError):
            self.env['calendar.event'].with_user(self.organizer_user).create(self.simple_event_values)

        # Activate the calendar synchronization of user B (self.attendee_user).
        self.attendee_user.microsoft_synchronization_stopped = False
        self.assertTrue(self.env['calendar.event'].with_user(self.attendee_user)._check_microsoft_sync_status())

        # Try creating an event with organizer as the user B but not inserting B as an attendee. A ValidationError must be thrown.
        with self.assertRaises(ValidationError):
            self.env['calendar.event'].with_user(self.organizer_user).create(self.simple_event_values)

        # Set mock return values for the event creation.
        event_id = "123"
        event_iCalUId = "456"
        mock_insert.return_value = (event_id, event_iCalUId)
        mock_get_events.return_value = ([], None)

        # Create event matching the creation conditions: user B is synced and now listed as an attendee. Set mock return values.
        self.simple_event_values['partner_ids'] = [Command.set([self.organizer_user.partner_id.id, self.attendee_user.partner_id.id])]
        event = self.env['calendar.event'].with_user(self.organizer_user).create(self.simple_event_values)
        self.call_post_commit_hooks()
        event.invalidate_recordset()

        # Ensure that event was inserted and user B (self.attendee_user) is the organizer and is also listed as attendee.
        mock_insert.assert_called_once()
        self.assertEqual(event.user_id, self.attendee_user, "Event organizer must be user B (self.attendee_user) after event creation by user A (self.organizer_user).")
        self.assertTrue(self.attendee_user.partner_id.id in event.partner_ids.ids, "User B (self.attendee_user) should be listed as attendee after event creation.")

    @patch.object(MicrosoftCalendarService, 'get_events')
    def test_create_simple_event_from_outlook_portal_organizer_calendar(self, mock_get_events):
        """
        An event has been created in Outlook with a portal user email and synced in the Odoo organizer calendar.
        """
        # arrange
        # Create a portal users
        portal_user = self.env['res.users'].create({
            'name': 'Portal User (Test)',
            'login': 'portal_user@portal_user.com',
            'email': 'portal_user@portal_user.com',
            'password': 'portal_user',
            'groups_id': [Command.link(self.env.ref('base.group_portal').id)]
        })
        # And add token validity with one hour of time window for properly checking the sync status.
        portal_user.microsoft_calendar_token_validity = fields.Datetime.now() + timedelta(hours=1)

        ms_event_id = '987'

        mock_get_events.return_value = (MicrosoftEvent([dict(
            self.simple_event_from_outlook_organizer,
            id=ms_event_id,
            organizer={'emailAddress': {'address': portal_user.email, 'name': portal_user.name}}
        )]), None)

        # act
        # User attendee for sync, attendee is an internal user
        self.attendee_user.with_user(self.attendee_user).sudo()._sync_microsoft_calendar()

        # assert
        event = self.env['calendar.event'].search([("microsoft_id", "like", ms_event_id)])
        self.assertEqual(portal_user.login, event[0]["user_id"]["email"])
