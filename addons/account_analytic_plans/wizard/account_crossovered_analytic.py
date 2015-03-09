# -*- coding: utf-8 -*-

import time

from openerp import api, fields, models, _
from openerp.exceptions import UserError


class AccountCrossoveredAnalytic(models.TransientModel):
    _name = "account.crossovered.analytic"
    _description = "Print Crossovered Analytic"

    date1 = fields.Date(string='Start Date', required=True, default=lambda *a: time.strftime('%Y-01-01'))
    date2 = fields.Date(string='End Date', required=True, default=lambda *a: time.strftime('%Y-%m-%d'))
    journal_ids = fields.Many2many('account.analytic.journal', 'crossovered_journal_rel', 'crossover_id', 'journal_id', string='Analytic Journal')
    ref = fields.Many2one('account.analytic.account', string='Analytic Account Reference', required=True)
    empty_line = fields.Boolean(string='Dont show empty lines')

    @api.multi
    def print_report(self):
        self.env.cr.execute('SELECT account_id FROM account_analytic_line')
        result = self.env.cr.fetchall()
        acc_ids = [x[0] for x in result]

        data = self.read()[0]
        data['ref'] = data['ref'][0]

        obj_acc = self.env['account.analytic.account'].browse(data['ref'])
        name = obj_acc.name

        accounts = self.env['account.analytic.account'].search([('parent_id', 'child_of', [data['ref']])])

        flag = True
        for acc in accounts.ids:
            if acc in acc_ids:
                flag = False
                break
        if flag:
            raise UserError(_('There are no analytic lines related to account %s.' % name))

        datas = {
            'ids': [],
            'model': 'account.analytic.account',
            'form': data
        }
        return self.env['report'].get_action(accounts, 'account_analytic_plans.report_crossoveredanalyticplans', data=datas)
