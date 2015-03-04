# -*- coding: utf-8 -*-

import time
from openerp import api, fields, models


class AccountBudgetCrossveredSummaryReport(models.TransientModel):
    """
    This wizard provides the crossovered budget summary report'
    """
    _name = 'account.budget.crossvered.summary.report'
    _description = 'Account Budget  crossvered summary report'

    date_from = fields.Date(string='Start of period', required=True, default=lambda *a: time.strftime('%Y-01-01'))
    date_to = fields.Date(string='End of period', required=True, default=fields.Date.context_today)

    @api.multi
    def check_report(self):
        data = self.read()[0]
        datas = {
            'ids': self.env.context.get('active_ids',[]),
            'model': 'crossovered.budget',
            'form': data
        }
        datas['form']['ids'] = datas['ids']
        datas['form']['report'] = 'analytic-one'
        return self.env['report'].get_action(self.env['account.budget.crossvered.summary.report'], 'account_budget.report_crossoveredbudget', data=datas)
