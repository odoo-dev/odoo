import json

from dateutil.relativedelta import relativedelta
from odoo import api, Command, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import date_utils, format_date


class MrpProductionAccruedEntryWizard(models.TransientModel):
    _name = 'mrp.production.accrued.entry.wizard'
    _description = 'Mrp Production Accrued Entry Wizard'
    _inherit = 'account.accrued.entry.mixin'
    _check_company_auto = True

    def _get_default_date(self):
        return date_utils.get_month(fields.Date.context_today(self))[0] - relativedelta(days=1)

    def _get_default_company(self):
        orders = self.env['mrp.production'].browse(self.env.context['active_ids'])
        return orders and orders[0].company_id.id

    company_id = fields.Many2one('res.company', default=_get_default_company, required=True)
    currency_id = fields.Many2one(related='company_id.currency_id')
    account_id = fields.Many2one(
        'account.account',
        'Production Expense',
        domain="[('account_type', '=', 'expense')]",
        required=True,
        check_company=True,
    )
    journal_id = fields.Many2one(
        'account.journal',
        'Journal',
        compute='_compute_journal_id', readonly=False,
        domain="[('type', '=', 'general')]",
        required=True,
        check_company=True,
    )
    date = fields.Date(default=_get_default_date, required=True)
    reversal_date = fields.Date(
        compute="_compute_reversal_date",
        required=True,
        readonly=False,
    )
    preview_data = fields.Text(compute='_compute_preview_data')
    amount = fields.Monetary(string='Amount', help="Specify an arbitrary value that will be accrued on a \
        default account for the entire order, regardless of the products on the different lines.")
    should_display_amount = fields.Boolean(compute='_compute_should_display_amount')

    @api.depends('company_id')
    def _compute_journal_id(self):
        for record in self:
            record.journal_id = self.env['account.journal'].search([
                *self.env['account.journal']._check_company_domain(record.company_id),
                ('type', '=', 'general')
            ], limit=1)

    @api.depends('date', 'journal_id', 'account_id', 'amount')
    def _compute_preview_data(self):
        for record in self:
            move_vals = record._get_move_vals()
            record.preview_data = self._get_preview_data(move_vals, record.company_id.currency_id)

    @api.depends('date', 'amount')
    def _compute_should_display_amount(self):
        is_single_order = len(self.env.context['active_ids']) == 1
        for record in self:
            preview_data = json.loads(self.preview_data)
            lines = preview_data.get('groups_vals', [])[0].get('items_vals', [])
            record.should_display_amount = record.amount or (is_single_order and not lines)

    @api.depends('date')
    def _compute_reversal_date(self):
        for record in self:
            if not record.reversal_date or record.reversal_date <= record.date:
                record.reversal_date = record.date + relativedelta(days=1)
            else:
                record.reversal_date = record.reversal_date

    def _get_move_vals(self):
        self.ensure_one()
        productions = self.env['mrp.production'].browse(self.env.context['active_ids'])
        if len(productions.company_id) != 1:
            raise UserError(_('Entries can only be created for a single company at a time.'))
        
        move_lines = []
        total_balance = 0.0
        for mo in productions:
            if mo.state not in ('progress', 'to_close'):
                continue
            wip_vals = mo._get_wip_vals()
            total_balance += wip_vals['balance']
            vals = self._get_aml_vals(**wip_vals)
            move_lines.append(Command.create(vals))
        if not self.currency_id.is_zero(total_balance):
            vals = self._get_aml_vals(_('Accrued total'), -total_balance, self.account_id.id, self.currency_id.id, -total_balance)
            move_lines.append(Command.create(vals))
        return {
            'ref': _('Accrued Expense entry as of %s', format_date(self.env, self.date)),
            'journal_id': self.journal_id.id,
            'date': self.date,
            'line_ids': move_lines,
        }

    def create_entries(self):
        if self.reversal_date <= self.date:
            raise UserError(_('Reversal date must be posterior to date.'))

        move, reverse_move = self.create_and_reverse_move()
        return {
            'name': _('Accrual Moves'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'view_mode': 'tree,form',
            'domain': [('id', 'in', (move.id, reverse_move.id))],
        }
