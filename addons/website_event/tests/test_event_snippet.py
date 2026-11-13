# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date, datetime, timedelta

from freezegun import freeze_time

from odoo.addons.event.tests.common import EventCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestEventSnippet(EventCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reference_now = datetime(2020, 7, 6, 10, 0, 0)
        cls.multi_slots_event = cls.env['event.event'].create({
            'name': 'Multi Slots Event',
            'date_begin': datetime(2020, 7, 1, 8, 0, 0),
            'date_end': datetime(2020, 8, 31, 18, 0, 0),
            'date_tz': 'UTC',
            'is_multi_slots': True,
            'seats_limited': True,
            'seats_max': 1,
            'website_published': True,
        })
        cls.slot_past, cls.slot_sold_out, cls.slot_open, cls.slot_open_later = cls.env['event.slot'].create([{
            'event_id': cls.multi_slots_event.id,
            'date': slot_date,
            'start_hour': 10,
            'end_hour': 12,
        } for slot_date in (date(2020, 7, 5), date(2020, 7, 7), date(2020, 7, 8), date(2020, 7, 9))])
        cls.env['event.registration'].create({
            'event_id': cls.multi_slots_event.id,
            'event_slot_id': cls.slot_sold_out.id,
            'name': 'Attendee',
        })
        cls.regular_event = cls.env['event.event'].create({
            'name': 'Regular Event',
            'date_begin': datetime(2020, 7, 10, 8, 0, 0),
            'date_end': datetime(2020, 7, 10, 18, 0, 0),
            'date_tz': 'UTC',
            'website_published': True,
        })

    def _render_snippet(self, events, template='website_event.dynamic_filter_template_event_event_picture'):
        return str(self.env['ir.qweb']._render(template, {
            'records': [{'_record': event, 'call_to_action_url': '/event', 'name': event.name} for event in events],
            'events_event_time_active': True,
            'events_event_location_active': True,
        }))

    def test_filter_open_slots(self):
        """ Only upcoming slots with available seats are kept, in their original order. """
        with freeze_time(self.reference_now):
            self.assertEqual(
                self.multi_slots_event.event_slot_ids._filter_open_slots(),
                self.slot_open | self.slot_open_later,
            )

    def test_snippet_displays_next_open_slot(self):
        """ Multi-slots events display their next open slot date, regular events their start date. """
        with freeze_time(self.reference_now):
            html = self._render_snippet(self.multi_slots_event | self.regular_event)
        self.assertIn(f'datetime="{self.slot_open.start_datetime}"', html)
        self.assertIn(f'datetime="{self.regular_event.date_begin}"', html)
        for not_displayed in (self.multi_slots_event.date_begin, self.slot_past.start_datetime,
                              self.slot_sold_out.start_datetime):
            self.assertNotIn(f'datetime="{not_displayed}"', html)

    def test_snippet_queries_do_not_scale_with_slots(self):
        """ Finding open slots must not run queries for each slot of the event. """
        many_slots_event = self.multi_slots_event.copy({'name': 'Many Slots Event'})
        self.env['event.slot'].create([{
            'event_id': many_slots_event.id,
            'date': date(2020, 7, 7) + timedelta(days=offset),
            'start_hour': 10,
            'end_hour': 12,
        } for offset in range(30)])

        query_counts = []
        with freeze_time(self.reference_now):
            self._render_snippet(self.regular_event)  # warm up template compilation caches
            for event in (self.multi_slots_event, many_slots_event):
                self.env.invalidate_all()
                query_count = self.env.cr.sql_log_count
                self._render_snippet(event)
                query_counts.append(self.env.cr.sql_log_count - query_count)
        self.assertEqual(query_counts[0], query_counts[1])
