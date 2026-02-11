from odoo import api, fields, models
from odoo.tools import date_utils


class SpreadsheetDateFilter(models.Model):
    _name = "spreadsheet.date.filter"

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer()
    active = fields.Boolean(default=True)
    category = fields.Selection([
        ("day", "Day"),
        ("week", "Week"),
        ("month", "Month"),
        ("year", "Year"),
    ], required=True)

    from_pattern = fields.Char(required=True)
    to_pattern = fields.Char(required=True)
    from_preview = fields.Datetime(compute="_compute_previews")
    to_preview = fields.Datetime(compute="_compute_previews")

    # offsets for comparison periods
    offset_previous = fields.Char(required=True)
    offset_next = fields.Char(required=True)

    # offset previews
    offset_previous_from_preview = fields.Datetime(compute="_compute_previews")
    offset_previous_to_preview = fields.Datetime(compute="_compute_previews")
    offset_next_from_preview = fields.Datetime(compute="_compute_previews")
    offset_next_to_preview = fields.Datetime(compute="_compute_previews")

    navigation_mode = fields.Selection([
        ("month", "Full month"),
        ("year", "Full year"),
        ("relative", "Relative Period"),
    ], default="relative", required=True, string="Navigation Mode", help="""Defines how the date range is calculated when navigating to the previous or next period.
- Relative Period: The period is simply shifted by the offset.
- Full Month/Year: The period becomes the full month/year (e.g. 'Month to Date' becomes 'Previous Month').
""")

    # custom previous/next periods
    next_from_pattern = fields.Char()
    next_to_pattern = fields.Char()
    previous_from_pattern = fields.Char()
    previous_to_pattern = fields.Char()
    next_from_preview = fields.Datetime(compute="_compute_previews")
    next_to_preview = fields.Datetime(compute="_compute_previews")
    previous_from_preview = fields.Datetime(compute="_compute_previews")
    previous_to_preview = fields.Datetime(compute="_compute_previews")

    @api.depends(
        "from_pattern", "to_pattern",
        'offset_previous', 'offset_next',
        "next_from_pattern", "next_to_pattern",
        "previous_from_pattern", "previous_to_pattern",
    )
    def _compute_previews(self):
        for record in self:
            record.from_preview = record._get_date_value(record.from_pattern)
            record.to_preview = record._get_date_value(record.to_pattern)
            record.offset_next_from_preview = record._get_date_value(f'{record.from_pattern} {record.offset_next}')
            record.offset_next_to_preview = record._get_date_value(f'{record.to_pattern} {record.offset_next}')
            record.offset_previous_from_preview = record._get_date_value(f'{record.from_pattern} {record.offset_previous}')
            record.offset_previous_to_preview = record._get_date_value(f'{record.to_pattern} {record.offset_previous}')

            record.next_from_preview = record._get_date_value(record.next_from_pattern)
            record.next_to_preview = record._get_date_value(record.next_to_pattern)
            record.previous_from_preview = record._get_date_value(record.previous_from_pattern)
            record.previous_to_preview = record._get_date_value(record.previous_to_pattern)

    def _get_date_value(self, pattern):
        if not pattern:
            return False
        try:
            value = date_utils.parse_date(pattern, self.env)
            return value
        except ValueError:
            return False