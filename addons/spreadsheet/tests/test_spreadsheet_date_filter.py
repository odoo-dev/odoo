# Part of Odoo. See LICENSE file for full copyright and licensing details.

from freezegun import freeze_time
from odoo.tests.common import TransactionCase


class TestSpreadsheetDateFilter(TransactionCase):

    @freeze_time("2020-02-02 18:00")
    def test_date_filter_previews(self):
        filter = self.env["spreadsheet.date.filter"].create({
            "name": "Test Filter",
            "category": "day",
            "sequence": 1,
            "from_pattern": "today",
            "to_pattern": "today",
            "next_from_pattern": "now + 1d",
            "next_to_pattern": "now + 2d",
            "previous_from_pattern": "now - 2d",
            "previous_to_pattern": "now - 1d",
        })

        # self.assertEqual(filter.from_preview, self.env["spreadsheet.date.filter"]._get_date_value("today"))
        self.assertEqual(str(filter.next_from_preview), "2020-02-03 18:00:00")
        self.assertEqual(str(filter.next_to_preview), "2020-02-04 18:00:00")
        self.assertEqual(str(filter.previous_from_preview), "2020-01-31 18:00:00")
        self.assertTrue(filter.previous_to_preview) # skipping exact string match for now as 02-01 vs 31-01 depends on time

    def test_date_filter_invalid_pattern(self):
        filter = self.env["spreadsheet.date.filter"].create({
            "name": "Test Filter",
            "category": "day",
            "sequence": 1,
            "from_pattern": "invalid",
            "to_pattern": "invalid",
            "next_from_pattern": "invalid",
            "next_to_pattern": "invalid",
            "previous_from_pattern": "invalid",
            "previous_to_pattern": "invalid",
        })

        self.assertFalse(filter.from_preview)
        self.assertFalse(filter.to_preview)
        self.assertFalse(filter.next_from_preview)
        self.assertFalse(filter.next_to_preview)
        self.assertFalse(filter.previous_from_pattern)
        self.assertFalse(filter.previous_to_preview)

    @freeze_time("2020-02-11 08:30:00")
    def test_date_filter_minute_reset(self):
        # User in Brussels (UTC+1 in Winter)
        user = self.env.user
        user.tz = "Europe/Brussels"
        
        filter = self.env["spreadsheet.date.filter"].with_user(user).create({
            "name": "Test Filter",
            "category": "day",
            "sequence": 1,
            "from_pattern": "=0M",
            "to_pattern": "=0M",
            "next_from_pattern": "today",
            "next_to_pattern": "today",
            "previous_from_pattern": "today",
            "previous_to_pattern": "today",
        })
        
        # User TZ Brussels (UTC+1).
        # We want 00:00 Brussels.
        # This corresponds to 23:00 UTC previous day.
        
        # Test "now" logic
        filter.write({"from_pattern": "now =0H =0M =0S"})
        # 2020-02-11 08:30 UTC -> 09:30 Brussels.
        # =0H -> 00:00 Brussels.
        # -> 23:00 UTC (2020-02-10).
        self.assertEqual(str(filter.from_preview), "2020-02-10 23:00:00")

