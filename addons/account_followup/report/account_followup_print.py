# -*- coding: utf-8 -*-

import time
from collections import defaultdict
from openerp import api, models
from openerp.tools.translate import _
from openerp.exceptions import UserError


class FollowupReport(models.AbstractModel):
    _name = "report.account_followup.report_followup"

    def _ids_to_objects(self, partner_ids):
        all_lines = []
        for line in self.env['account_followup.stat.by.partner'].browse(partner_ids):
            if line not in all_lines:
                all_lines.append(line)
        return all_lines

    def _lines_get(self, stat_by_partner_line):
        return self._lines_get_with_partner(stat_by_partner_line.partner_id, stat_by_partner_line.company_id.id)

    def _lines_get_with_partner(self, partner, company_id):
        moveline = self.env['account.move.line']
        moveline_ids = moveline.search([('partner_id', '=', partner.id),
                                        ('account_id.internal_type', '=', 'receivable'),
                                        ('reconciled', '=', False),
                                        ('company_id', '=', company_id.id), ])

        # lines_per_currency = {currency: [line data, ...], ...}
        lines_per_currency = defaultdict(list)
        for line in moveline_ids:
            currency_id = line.currency_id or line.company_id.currency_id
            line_data = {
                'name': line.move_id.name,
                'ref': line.ref,
                'date': line.date,
                'date_maturity': line.date_maturity,
                'balance': line.amount_currency if currency_id != line.company_id.currency_id else line.debit - line.credit,
                'blocked': line.blocked,
                'currency_id': currency_id,
            }
            lines_per_currency[currency_id].append(line_data)

        return [{'line': lines, 'currency': currency} for currency, lines in lines_per_currency.items()]

    def _get_text(self, stat_line, followup_id):
        followup = self.env['account_followup.followup']
        fp_line = followup.browse(followup_id).followup_line
        if not fp_line:
            raise UserError(_("The followup plan defined for the current company does not have any followup action."))
        #the default text will be the first fp_line in the sequence with a description.
        default_text = ''
        li_delay = []
        for line in fp_line:
            if not default_text and line.description:
                default_text = line.description
            li_delay.append(line.delay)
        li_delay.sort(reverse=True)
        #look into the lines of the partner that already have a followup level, and take the description of the higher level for which it is available
        partner_line_ids = self.env['account.move.line'].search([('partner_id', '=', stat_line.partner_id.id), ('reconciled', '=', False), ('company_id', '=', stat_line.company_id.id), ('blocked', '=', False), ('state', '!=', 'draft'), ('debit', '!=', False), ('account_id.internal_type', '=', 'receivable'), ('followup_line_id', '!=', False)])
        partner_max_delay = 0
        partner_max_text = ''
        for i in self.env['account.move.line'].browse(partner_line_ids):
            if i.followup_line_id.delay > partner_max_delay and i.followup_line_id.description:
                partner_max_delay = i.followup_line_id.delay
                partner_max_text = i.followup_line_id.description
        text = partner_max_delay and partner_max_text or default_text
        if text:
            Language = self.pool['res.lang']
            lang_ids = Language.search([('code', '=', stat_line.partner_id.lang)])
            date_format = lang_ids and Language.browse(lang_ids[0]).date_format or '%Y-%m-%d'
            text = text % {
                'partner_name': stat_line.partner_id.name,
                'date': time.strftime(date_format),
                'company_name': stat_line.company_id.name,
                'user_signature': self.env.user.signature or '',
            }

        return text

    @api.multi
    def render_html(self, data=None):
        report = self.env['report']
        followup_report = report._get_report_from_name('account_followup.report_followup')
        selected_records = self.env['account.followup'].browse(self.ids)
        docargs = {
            'doc_ids': self._ids,
            'doc_model': followup_report.model,
            'docs': selected_records,
            'time': time,
            'ids_to_objects': self._ids_to_objects(data['form']['partner_ids']),
            'getLines': self._lines_get(data['form']['stat_by_partner_line']),
            'get_text': self._get_text(data['form']['stat_line'], data['form']['followup_id']),
            'data': data,
        }
        return report.render('account_followup.report_followup', docargs)
