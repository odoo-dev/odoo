# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import uuid
from typing import Dict, Callable

from odoo import api, fields, models


class RestaurantFloor(models.Model):
    _inherit = "restaurant.floor"

    def _get_data_for_qr_codes_page(self, url: Callable):
        return [
            {
                "name": floor.name,
                "tables": floor.table_ids.filtered("active")._get_data_for_qr_codes_page(url),
            }
            for floor in self
        ]


class RestaurantTable(models.Model):
    _inherit = "restaurant.table"

    access_token = fields.Char(
        "Security Token",
        copy=False,
        required=True,
        readonly=True,
        default=lambda self: uuid.uuid4().hex[:8],
    )

    def _get_self_order_data(self) -> Dict:
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "access_token": self.access_token,
        }

    def _get_data_for_qr_codes_page(self, url: Callable):
        return [
            {
                "id": table.id,
                "name": table.name,
                "url": url(table.id),
            }
            for table in self
        ]

    def _get_access_token(self):
        return uuid.uuid4().hex[:8]
        
    @api.model
    def _set_access_token_to_demo_data_records(self):
        """
        We define a new access token field in this file. The problem is that
        the demo data records are written in the database before this field is defined.
        So we need to set the access token for the demo data records manually.
        """
        tables = self.env["restaurant.table"].search([])
        for table in tables:
            table.access_token = uuid.uuid4().hex[:8]
