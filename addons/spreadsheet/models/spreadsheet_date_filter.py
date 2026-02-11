# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools import date_utils


class SpreadsheetDateFilter(models.Model):
    _name = "spreadsheet.date.filter"

    name = fields.Char(required=True, translate=True)
    from_pattern = fields.Char(required=True)
    to_pattern = fields.Char(required=True)
    next_from_pattern = fields.Char(required=True)
    next_to_pattern = fields.Char(required=True)
    previous_from_pattern = fields.Char(required=True)
    previous_to_pattern = fields.Char(required=True)
    sequence = fields.Integer(required=True)
    active = fields.Boolean(default=True)
    category = fields.Selection([
        ("day", "Day"),
        ("week", "Week"),
        ("month", "Month"),
        ("year", "Year"),
        ("other", "Other"),
        ("other", "Other"),
    ], required=True)

    from_preview = fields.Datetime(compute="_compute_previews")
    to_preview = fields.Datetime(compute="_compute_previews")
    next_from_preview = fields.Datetime(compute="_compute_previews")
    next_to_preview = fields.Datetime(compute="_compute_previews")
    previous_from_preview = fields.Datetime(compute="_compute_previews")
    previous_to_preview = fields.Datetime(compute="_compute_previews")

    @api.depends(
        "from_pattern", "to_pattern",
        "next_from_pattern", "next_to_pattern",
        "previous_from_pattern", "previous_to_pattern",
    )
    def _compute_previews(self):
        for record in self:
            record.from_preview = record._get_date_value(record.from_pattern)
            record.to_preview = record._get_date_value(record.to_pattern)
            record.next_from_preview = record._get_date_value(record.next_from_pattern)
            record.next_to_preview = record._get_date_value(record.next_to_pattern)
            record.previous_from_preview = record._get_date_value(record.previous_from_pattern)
            record.previous_to_preview = record._get_date_value(record.previous_to_pattern)

    def _get_date_value(self, pattern):
        if not pattern:
            return False
        try:
            return date_utils.parse_date(pattern, self.env)
        except ValueError:
            return False