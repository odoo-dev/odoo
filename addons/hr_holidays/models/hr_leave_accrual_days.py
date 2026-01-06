# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class AccrualDays(models.Model):
    _name = 'hr.leave.accrual.day'
    _description = 'Accrual Day'
    _order = 'number asc'
    name = fields.Char(required=True)
    number = fields.Integer()
