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

        self.assertEqual(filter.from_preview, self.env["spreadsheet.date.filter"]._get_date_value("today"))
        self.assertEqual(str(filter.next_from_preview), "2020-02-03 18:00:00")
        self.assertEqual(str(filter.next_to_preview), "2020-02-04 18:00:00")
        self.assertEqual(str(filter.previous_from_preview), "2020-01-31 18:00:00")
        self.assertEqual(str(filter.previous_to_preview), "2020-02-01 18:00:00")

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
        self.assertFalse(filter.previous_from_preview)
        self.assertFalse(filter.previous_to_preview)
