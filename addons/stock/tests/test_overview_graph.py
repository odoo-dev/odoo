# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json

from datetime import datetime
from freezegun import freeze_time

from odoo.fields import Command
from odoo.tests import tagged, TransactionCase


@tagged('-at_install', 'post_install')
class TestOverviewGraph(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.picking_type = cls.env['stock.picking.type'].create({
            'name': 'pick type',
            'sequence_code': '0',
            'code': 'incoming',
        })
        cls.product = cls.env['product.product'].create({'name': 'a'})

    def create_pickings(self, datetimes):
        pickings = self.env["stock.picking"].create([
            {
                'scheduled_date': scheduled_date,
                'picking_type_id': self.picking_type.id,
                'move_ids': [Command.create({'product_id': self.product.id})],
            }
            for scheduled_date in datetimes
        ])
        pickings.action_confirm()

    @freeze_time("2024-06-06 11:00")
    def test_date_category_utc(self):
        self.env.user.tz = "UTC"
        month_day_to_category = {
            3: "before",
            4: "before",
            5: "yesterday",
            6: "today",
            7: "day_1",
            8: "day_2",
            9: "after",
            10: "after",
        }
        self.create_pickings([datetime(2024, 6, day, 14, 0) for day in month_day_to_category])
        self.assertEqual(
            json.loads(self.picking_type.kanban_dashboard_graph),
            [
                {
                    "key": "Transfers",
                    "picking_type_id": self.picking_type.id,
                    "values": [
                        {"label": "Before", "type": "past", "value": 2},
                        {"label": "Yesterday", "type": "past", "value": 1},
                        {"label": "Today", "type": "present", "value": 1},
                        {"label": "Tomorrow", "type": "future", "value": 1},
                        {"label": "The day after tomorrow", "type": "future", "value": 1},
                        {"label": "After", "type": "future", "value": 2},
                    ],
                }
            ]
        )

    @freeze_time("2024-06-06 11:00")
    def test_date_category_utc_plus_2h(self):
        self.env.user.tz = "Europe/Brussels"
        datetime_to_category = {
            datetime(2024, 6, 5, 21, 0): "yesterday",
            datetime(2024, 6, 5, 23, 0): "today",
            datetime(2024, 6, 6, 10, 0): "today",
            datetime(2024, 6, 6, 21, 0): "today",
            datetime(2024, 6, 6, 23, 0): "day_1",
        }
        self.create_pickings(datetime_to_category)
        self.assertEqual(
            json.loads(self.picking_type.kanban_dashboard_graph),
            [
                {
                    "key": "Transfers",
                    "picking_type_id": self.picking_type.id,
                    "values": [
                        {"label": "Before", "type": "past", "value": 0},
                        {"label": "Yesterday", "type": "past", "value": 1},
                        {"label": "Today", "type": "present", "value": 3},
                        {"label": "Tomorrow", "type": "future", "value": 1},
                        {"label": "The day after tomorrow", "type": "future", "value": 0},
                        {"label": "After", "type": "future", "value": 0},
                    ],
                }
            ]
        )

    @freeze_time("2024-06-06 11:00")
    def test_date_category_utc_minus_3h(self):
        self.env.user.tz = "America/Sao_Paulo"
        datetime_to_category = {
            datetime(2024, 6, 6, 2, 0): "yesterday",
            datetime(2024, 6, 6, 4, 0): "today",
            datetime(2024, 6, 6, 9, 0): "today",
            datetime(2024, 6, 7, 2, 0): "today",
            datetime(2024, 6, 7, 3, 0): "day_1",
        }
        self.create_pickings(datetime_to_category)
        self.assertEqual(
            json.loads(self.picking_type.kanban_dashboard_graph),
            [
                {
                    "key": "Transfers",
                    "picking_type_id": self.picking_type.id,
                    "values": [
                        {"label": "Before", "type": "past", "value": 0},
                        {"label": "Yesterday", "type": "past", "value": 1},
                        {"label": "Today", "type": "present", "value": 3},
                        {"label": "Tomorrow", "type": "future", "value": 1},
                        {"label": "The day after tomorrow", "type": "future", "value": 0},
                        {"label": "After", "type": "future", "value": 0},
                    ],
                }
            ]
        )
