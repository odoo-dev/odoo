# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


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
    ], required=True)