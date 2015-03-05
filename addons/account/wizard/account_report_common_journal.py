from openerp import models, fields, api


class AccountCommonJournalReport(models.TransientModel):
    _name = 'account.common.journal.report'
    _description = 'Account Common Journal Report'
    _inherit = "account.common.report"

    amount_currency = fields.Boolean(string='With Currency',
        help="Print Report with the currency column if the currency differs from the company currency.")

    @api.multi
    def _build_contexts(self, data):
        result = super(AccountCommonJournalReport, self)._build_contexts(data)

        if data['form']['filter'] == 'filter_date':
            self._cr.execute('SELECT date FROM account_move_line WHERE date >= %s AND date <= %s', (data['form']['date_from'], data['form']['date_to']))
            result['date'] = map(lambda x: x[0], self._cr.fetchall())
        elif data['form']['filter'] == 'filter_period':
            result['date'] = fields.Date.context_today
        return result

    @api.multi
    def pre_print_report(self, data):
        data['form'].update(self.read(['amount_currency'])[0])
        fy_ids = data['form']['fiscalyear_id'] and [data['form']['fiscalyear_id']] or self.env['account.fiscalyear'].search([('state', '=', 'draft')]).ids
        date = fields.Date.context_today
        # TODO : account_journal_period has been removed
#         data['form']['active_ids'] = self.env['account.journal.period'].search([('journal_id', 'in', data['form']['journal_ids']), ('period_id', 'in', period_list)])
        return data
