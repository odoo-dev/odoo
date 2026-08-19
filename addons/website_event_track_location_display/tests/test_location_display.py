from datetime import datetime
from freezegun import freeze_time

from odoo.addons.website_event.tests.common import TestEventOnlineCommon
from odoo.addons.website_event_track_location_display.controllers.location_display import (
    EventTrackLocationDisplayController,
)
from odoo.tests.common import HttpCase, users


class TestLocationDisplay(TestEventOnlineCommon, HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.event_0.write({
            'is_published': True,
            'website_track': True,
        })
        cls.location = cls.env['event.track.location'].create({'name': 'Main Stage'})
        cls.tracks = cls.env['event.track'].create([
            {
                'name': 'Finished',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 8),
                'duration': 1,
                'is_published': True,
            }, {
                'name': 'Live',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 10),
                'duration': 1,
                'is_published': True,
                'partner_name': 'Test Speaker',
                'partner_function': 'Engineer',
                'partner_company_name': 'Example Company',
            }, {
                'name': 'Next',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 12),
                'duration': 0.5,
                'is_published': True,
            }, {
                'name': 'Later',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 13),
                'duration': 0.5,
                'is_published': True,
            }, {
                'name': 'Third upcoming track',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 14),
                'duration': 0.5,
                'is_published': True,
            }, {
                'name': 'Fourth upcoming track',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 14, 30),
                'duration': 0.5,
                'is_published': True,
            }, {
                'name': 'Unpublished',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 5, 10, 30),
                'duration': 0.5,
                'is_published': False,
            }, {
                'name': 'Tomorrow',
                'event_id': cls.event_0.id,
                'location_id': cls.location.id,
                'date': datetime(2026, 3, 6, 9),
                'duration': 1,
                'is_published': True,
            },
        ])
        cls.tomorrow_stage = cls.env['event.track.location'].create({'name': 'Tomorrow Stage'})
        cls.tomorrow_stage_track = cls.env['event.track'].create({
            'name': 'Tomorrow Elsewhere',
            'event_id': cls.event_0.id,
            'location_id': cls.tomorrow_stage.id,
            'date': datetime(2026, 3, 6, 10),
            'duration': 1,
            'is_published': True,
        })

    @users('user_eventmanager')
    def test_location_display_schedule(self):
        """ Test the location display schedule logic for live, upcoming, and finished tracks. """
        controller = EventTrackLocationDisplayController()
        event = self.event_0.with_env(self.env)
        location, tracks = self.location, self.tracks

        self.assertEqual(event.location_display_upcoming_track_count, '3')
        with freeze_time(datetime(2026, 3, 5, 10, 15)):
            schedule = controller._get_location_display_schedule(event, location.id)
        self.assertEqual(schedule['live_track'], tracks[1])
        self.assertEqual(schedule['live_status'], 'live')
        self.assertEqual(schedule['upcoming_tracks'], tracks[2:5])
        self.assertEqual(schedule['location_name'], location.name)

        event.location_display_upcoming_track_count = '4'
        with freeze_time(datetime(2026, 3, 5, 10, 15)):
            schedule = controller._get_location_display_schedule(event, location.id)
        self.assertEqual(schedule['upcoming_tracks'], tracks[2:6])

        with freeze_time(datetime(2026, 3, 5, 11, 30)):
            gap_schedule = controller._get_location_display_schedule(event, location.id)
        self.assertFalse(gap_schedule['live_track'])
        self.assertEqual(gap_schedule['live_status'], 'gap')

        with freeze_time(datetime(2026, 3, 5, 15)):
            finished_schedule = controller._get_location_display_schedule(event, location.id)
        self.assertFalse(finished_schedule['upcoming_tracks'])
        self.assertEqual(finished_schedule['live_status'], 'finished')
        self.assertEqual(finished_schedule['next_track'], tracks[7])

        with freeze_time(datetime(2026, 3, 5, 10, 15)):
            tomorrow_schedule = controller._get_location_display_schedule(event, self.tomorrow_stage.id)
        self.assertEqual(tomorrow_schedule['live_status'], 'none')
        self.assertEqual(tomorrow_schedule['next_track'], self.tomorrow_stage_track)
        self.assertEqual(tomorrow_schedule['location_name'], self.tomorrow_stage.name)

        with freeze_time(datetime(2026, 3, 7)):
            past_schedule = controller._get_location_display_schedule(event, location.id)
        self.assertEqual(past_schedule['location_name'], event.name)

        self.assertFalse(location.location_display_url)
        self.assertEqual(
            location.with_context(active_model='event.event', active_id=event.id).location_display_url,
            f'/event/{event.id}/location-display/{location.id}',
        )

    @freeze_time(datetime(2026, 3, 5, 10, 15))
    def test_location_display(self):
        display_url = self.location.with_context(
            active_model='event.event', active_id=self.event_0.id,
        ).location_display_url
        self.start_tour(display_url, 'website_event_track_location_display', login='admin')

    def test_location_display_cookies_bar(self):
        """ Test that the location display page does not show the cookies bar even if it is enabled on the website. """
        self.authenticate(None, None)
        self.env['website'].get_current_website().cookies_bar = True
        self.assertIn('website_cookies_bar', self.url_open('/').text)
        display_url = self.location.with_context(
            active_model='event.event', active_id=self.event_0.id,
        ).location_display_url
        response = self.url_open(display_url)
        self.assertNotIn('website_cookies_bar', response.text)
