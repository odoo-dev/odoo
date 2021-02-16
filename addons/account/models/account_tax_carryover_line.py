from odoo import models, fields, api, _


class AccountTaxCarryoverLine(models.Model):
    _name = 'account.tax.carryover.line'
    _description = 'Tax carryover line'

    name = fields.Char(required=True)
    amount = fields.Float(required=True, default=0.0)
    date = fields.Date(required=True, default=fields.Date.context_today, readonly=True)
    tax_report_line_id = fields.Many2one(string="Tax report line", comodel_name='account.tax.report.line')
    carried_over_date = fields.Date(
        string="Carried over on the:",
        help="Line marked as carried over will no longer be taken into consideration when calculating current period "
             "carry over as they no longer impact it.\n When calculating past periods, we'll take into account the "
             "date to still take into consideration lines marked as carried over after the start of that period.",
        readonly=True
    )
