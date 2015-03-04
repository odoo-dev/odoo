# -*- coding: utf-8 -*-
from openerp import api, fields, models, tools, _
from openerp.tools import ustr
from openerp.exceptions import UserError


# ---------------------------------------------------------
# Utils
# ---------------------------------------------------------
def strToDate(dt):
    return fields.Date.from_string(dt)

def strToDatetime(strdate):
    return fields.Datetime.from_string(strdate)

# ---------------------------------------------------------
# Budgets
# ---------------------------------------------------------
class AccountBudgetPost(models.Model):
    _name = "account.budget.post"
    _description = "Budgetary Position"

    code = fields.Char(required=True, size=64)
    name = fields.Char(required=True)
    account_ids = fields.Many2many('account.account', 'account_budget_rel', 'budget_id', 'account_id', string='Accounts', domain=[('deprecated', '=', False)])
    crossovered_budget_line = fields.One2many('crossovered.budget.lines', 'general_budget_id', string='Budget Lines')
    company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env['res.company']._company_default_get('account.budget.post'))

    _order = "name"



class CrossoveredBudget(models.Model):
    _name = "crossovered.budget"
    _description = "Budget"

    name = fields.Char(required=True, states={'done': [('readonly', True)]})
    code = fields.Char(required=True, size=16, states={'done': [('readonly', True)]})
    creating_user_id = fields.Many2one('res.users', string='Responsible User', default=lambda self: self.env.uid)
    validating_user_id = fields.Many2one('res.users', string='Validate User', readonly=True)
    date_from = fields.Date(string='Start Date', required=True, states={'done': [('readonly', True)]})
    date_to = fields.Date(string='End Date', required=True, states={'done': [('readonly', True)]})
    state = fields.Selection([('draft', 'Draft'), ('cancel', 'Cancelled'), ('confirm', 'Confirmed'), ('validate', 'Validated'), ('done', 'Done')], index=True, required=True, readonly=True, copy=False, default='draft')
    crossovered_budget_line = fields.One2many('crossovered.budget.lines', 'crossovered_budget_id', string='Budget Lines', states={'done': [('readonly', True)]}, copy=True)
    company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env['res.company']._company_default_get('account.budget.post'))

    @api.multi
    def budget_confirm(self):
        self.write({
            'state': 'confirm'
        })
        return True

    @api.multi
    def budget_draft(self):
        self.write({
            'state': 'draft'
        })
        return True

    @api.multi
    def budget_validate(self):
        self.write({
            'state': 'validate',
            'validating_user_id': self.env.uid,
        })
        return True

    @api.multi
    def budget_cancel(self):
        self.write({
            'state': 'cancel'
        })
        return True

    @api.multi
    def budget_done(self):
        self.write({
            'state': 'done'
        })
        return True


class CrossoveredBudgetLines(models.Model):

    @api.multi
    def _prac_amt(self):
        res = {}
        amount = 0.0
        for line in self:
            acc_ids = [account_id.id for account_id in line.general_budget_id.account_ids]
            if not acc_ids:
                raise UserError(_("The Budget '%s' has no accounts!") % ustr(line.general_budget_id.name))
            if line.analytic_account_id.id:
                analytic_lines  = self.env['account.analytic.line'].search([('account_id', '=', line.analytic_account_id.id), ('date', '>=', line.date_from), ('date', '<=', line.date_to), ('general_account_id', 'in', acc_ids)])
                for analytic_line in analytic_lines:
                    amount += analytic_line.amount
            res[line.id] = amount
        return res

    @api.multi
    def _prac(self):
        amount = 0.0
        for line in self:
            acc_ids = [account_id.id for account_id in line.general_budget_id.account_ids]
            if not acc_ids:
                raise UserError(_("The Budget '%s' has no accounts!") % ustr(line.general_budget_id.name))
            if line.analytic_account_id.id:
                analytic_lines  = self.env['account.analytic.line'].search([('account_id', '=', line.analytic_account_id.id), ('date', '>=', line.date_from), ('date', '<=', line.date_to), ('general_account_id', 'in', acc_ids)])
                for analytic_line in analytic_lines:
                    amount += analytic_line.amount
            line.practical_amount = amount

    @api.multi
    def _theo_amt(self):
        res = {}
        for line in self:
            today = strToDatetime(fields.Datetime.now())
            if line.paid_date:
                if strToDate(line.date_to) <= strToDate(line.paid_date):
                    theo_amt = 0.00
                else:
                    theo_amt = line.planned_amount
            else:
                line_timedelta = strToDatetime(line.date_to) - strToDatetime(line.date_from)
                elapsed_timedelta = today - strToDatetime(line.date_from)
                if elapsed_timedelta.days < 0:
                    # If the budget line has not started yet, theoretical amount should be zero
                    theo_amt = 0.00
                elif line_timedelta.days > 0 and today < strToDatetime(line.date_to):
                    # If today is between the budget line date_from and date_to
                    theo_amt = (elapsed_timedelta.total_seconds() / line_timedelta.total_seconds()) * line.planned_amount
                else:
                    theo_amt = line.planned_amount
            res[line.id] = theo_amt
        return res

    @api.multi
    def _theo(self):
        for line in self:
            today = strToDatetime(fields.Datetime.now())
            if line.paid_date:
                if strToDate(line.date_to) <= strToDate(line.paid_date):
                    theo_amt = 0.00
                else:
                    theo_amt = line.planned_amount
            else:
                line_timedelta = strToDatetime(line.date_to) - strToDatetime(line.date_from)
                elapsed_timedelta = today - (strToDatetime(line.date_from))
                if elapsed_timedelta.days < 0:
                    # If the budget line has not started yet, theoretical amount should be zero
                    theo_amt = 0.00
                elif line_timedelta.days > 0 and today < strToDatetime(line.date_to):
                    # If today is between the budget line date_from and date_to
                    theo_amt = (elapsed_timedelta.total_seconds() / line_timedelta.total_seconds()) * line.planned_amount
                else:
                    theo_amt = line.planned_amount
            line.theoritical_amount = theo_amt

    @api.multi
    def _perc(self):
        for line in self:
            if line.theoritical_amount != 0.00:
                line.percentage = float((line.practical_amount or 0.0) / line.theoritical_amount) * 100
            else:
                line.percentage = 0.00

    _name = "crossovered.budget.lines"
    _description = "Budget Line"

    crossovered_budget_id = fields.Many2one('crossovered.budget', string='Budget', ondelete='cascade', index=True, required=True)
    analytic_account_id = fields.Many2one('account.analytic.account', string='Analytic Account')
    general_budget_id = fields.Many2one('account.budget.post', string='Budgetary Position', required=True)
    date_from = fields.Date(string='Start Date', required=True)
    date_to = fields.Date(string='End Date', required=True)
    paid_date = fields.Date(string='Paid Date')
    planned_amount = fields.Float(string='Planned Amount', required=True, digits=0)
    practical_amount = fields.Float(compute='_prac', string='Practical Amount', digits=0)
    theoritical_amount = fields.Float(compute='_theo', string='Theoretical Amount', digits=0)
    percentage = fields.Float(compute='_perc')
    company_id = fields.Many2one(related='crossovered_budget_id.company_id', comodel_name='res.company', string='Company', store=True, readonly=True)


class AccountAnalyticAccount(models.Model):
    _inherit = "account.analytic.account"

    crossovered_budget_line = fields.One2many('crossovered.budget.lines', 'analytic_account_id', string='Budget Lines')
