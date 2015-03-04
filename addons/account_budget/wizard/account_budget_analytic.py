    # -*- coding: utf-8 -*-

import time
from openerp import api, fields, models


class AccountBudgetAnalytic(models.TransientModel):

    _name = 'account.budget.analytic'
    _description = 'Account Budget report for analytic account'

    date_from = fields.Date(string='Start of period', required=True, default=lambda *a: time.strftime('%Y-01-01'))
    date_to = fields.Date(string='End of period', required=True, default=fields.Date.context_today)

    @api.multi
    def check_report(self):
        data = self.read()[0]
        datas = {
            'ids': self.env.context.get('active_ids', []),
            'model': 'account.analytic.account',
            'form': data
        }
        datas['form']['ids'] = datas['ids']
        return self.env['report'].get_action(self.env['account.budget.analytic'], 'account_budget.report_analyticaccountbudget', data=datas)
