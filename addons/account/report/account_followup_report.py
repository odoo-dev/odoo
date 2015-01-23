# -*- coding: utf-8 -*-
##############################################################################
#
#    Odoo, Open Source Management Solution
#    Copyright (C) 2004-2014 OpenErp S.A. (<http://odoo.com>).
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

from openerp import models, fields, api
from datetime import datetime


class report_account_followup_report(models.AbstractModel):
    _name = "account.followup.report"
    _description = "Followup Report"

    @api.model
    def get_lines(self, context_id, line_id=None):
        lines = []
        domain = [('reconciled', '=', False)]
        if not context_id.all_partners:
            domain.append(('partner_id', '=', int(context_id.partner_id)))
        total_total = 0
        total_residual = 0
        for invoice in self.env['account.invoice'].search(domain):
            overdue = datetime.today().strftime('%Y-%m-%d') > invoice.date_due
            date_due = overdue and (invoice.date_due, 'color: red;') or invoice.date_due
            lines.append({
                'id': invoice.id,
                'name': invoice.number,
                'type': 'invoice_id',
                'footnotes': self._get_footnotes('invoice_id', invoice.id),
                'unfoldable': False,
                'columns': [invoice.date_invoice, date_due, (invoice.expected_pay_date, invoice.internal_note), invoice.residual, invoice.amount_total],
            })
            total_total += invoice.amount_total
            total_residual += invoice.residual
        lines.append({
            'id': 0,
            'name': 'Total',
            'type': 'line',
            'footnotes': self._get_footnotes('line', 0, context_id),
            'unfoldable': False,
            'level': 0,
            'columns': ['', '', '', total_residual, total_total],
        })
        return lines

    @api.model
    def _get_footnotes(self, type, target_id, context_id):
        footnotes = context_id.footnotes.filtered(lambda s: s.type == type and s.target_id == target_id)
        result = {}
        for footnote in footnotes:
            result.update({footnote.column: footnote.number})
        return result

    @api.model
    def get_title(self):
        return 'Followup Report'

    @api.model
    def get_name(self):
        return 'followup_report'

    @api.model
    def get_report_type(self):
        return 'custom'

    @api.model
    def get_template(self):
        return 'account.report_followup'


class account_report_context_followup(models.TransientModel):
    _name = "account.report.context.followup"
    _description = "A particular context for the followup report"
    _inherit = "account.report.context.common"

    footnotes = fields.Many2many('account.report.footnote', 'account_context_footnote_followup', string='Footnotes')
    all_partners = fields.Boolean()
    partner_id = fields.Many2one('res.partner', string='Partner')
    summary = fields.Char(default=lambda s: s.env.user.company_id.overdue_msg.replace('\n', '<br />'))

    @api.multi
    def add_footnote(self, type, target_id, column, number, text):
        footnote = self.env['account.report.footnote'].create(
            {'type': type, 'target_id': target_id, 'column': column, 'number': number, 'text': text}
        )
        self.write({'footnotes': [(4, footnote.id)]})

    @api.model
    def get_partners(self):
        return self.env['res.partner'].search([])

    @api.multi
    def edit_footnote(self, number, text):
        footnote = self.footnotes.filtered(lambda s: s.number == number)
        footnote.write({'text': text})

    @api.multi
    def remove_footnote(self, number):
        footnotes = self.footnotes.filtered(lambda s: s.number == number)
        self.write({'footnotes': [(3, footnotes.id)]})

    def get_report_obj(self):
        return self.env['account.followup.report']

    @api.multi
    def remove_line(self, line_id):
        return

    @api.multi
    def add_line(self, line_id):
        return

    def get_columns_names(self):
        return ['Date', 'Due Date', 'Expected Date', 'Remaining', 'Total Due']

    def get_pdf(self):
        report_obj = self.get_report_obj()
        lines = report_obj.get_lines(self)
        base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
        rcontext = {
            'context': self,
            'o': report_obj,
            'lines': lines,
            'mode': 'print',
            'base_url': base_url,
            'css': '',
        }
        html = self.pool['ir.ui.view'].render(self._cr, self._uid, report_obj.get_template(), rcontext, context=self.env.context)

        landscape = False
        if len(self.get_columns_names()) > 4:
            landscape = True

        return self.env['report']._run_wkhtmltopdf([], [], [(0, html)], landscape, self.env.user.company_id.paperformat_id)
