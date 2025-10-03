# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields


class L10nMxRegisterFactoring(models.TransientModel):
    _name = 'l10n_mx.register.factoring'
    _description = 'Register Factoring'

    line_ids = fields.One2many('l10n_mx.register.factoring.line', 'factoring_id', string='Lines')
    statement_line_id = fields.Many2one('account.bank.statement.line', string='Statement Line', required=True)

    def factor(self):
        # TODO: everything :D
        return True


class L10nMxRegisterFactoringLine(models.TransientModel):
    _name = 'l10n_mx.register.factoring.line'

    factoring_id = fields.Many2one('l10n_mx.register.factoring', string='Factoring', required=True)
    currency_id = fields.Many2one('res.currency', string='Currency', related='factoring_id.statement_line_id.currency_id')

    move_id = fields.Many2one('account.move', string='Invoice', required=True)
    amount = fields.Monetary(string='Amount', help='The sold debt.', required=True)

    # TODO: stored computed with inverse and depends on amount to calculate 1 - amount
    cost = fields.Monetary(string='Cost', help='The cost of the sold debt.', required=True)
