from odoo import api, fields, models


class AccountMove(models.Model):
    _name = 'account.move'
    _inherit = ['account.move', 'mixin.ir.aggregate.source']


class AccountMoveAgg1(models.Model):
    _name = 'account.move.agg1'
    _inherit = 'mixin.ir.aggregate'
    _description = "Aggregated Account Table"

    _source_model = 'account.move'
    _log_access = False  # can we inherit it?

    journal_id = fields.Many2one('account.journal')
    date = fields.Date()
    state = fields.Char()
    move_type = fields.Char()

    currency_id = fields.Many2one('res.currency')
    amount_untaxed = fields.Monetary(metric=True)
    amount_total = fields.Monetary(metric=True)
