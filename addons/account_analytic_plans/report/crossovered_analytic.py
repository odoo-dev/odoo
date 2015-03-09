# -*- coding: utf-8 -*-

import time

from openerp import api, models


class CrossoveredAnalytic(models.AbstractModel):
    _name = 'report.account_analytic_plans.report_crossoveredanalyticplans'

    def find_children(self, ref_ids):
        if not ref_ids:
            return []
        to_return_ids = []
        final_list = []
        parent_list = []
        set_list = []
        analytic_obj = self.env['account.analytic.account']
        for id in ref_ids:
            # to avoid duplicate entries
            if id not in to_return_ids:
                to_return_ids.append(analytic_obj.search([('parent_id', 'child_of', [id])]))
        for data in to_return_ids:
            if data.parent_id and data.parent_id.id == ref_ids[0]:
                parent_list.append(data.id)
        final_list.append(ref_ids[0])
        set_list = self.set_account(parent_list)
        final_list.extend(set_list)
        return final_list  # to_return_ids[0]

    def set_account(self, cats):
        lst = []
        category = self.env['account.analytic.account'].browse(cats).read()
        for cat in category:
            lst.append(cat['id'])
            if cat['child_ids']:
                lst.extend(self.set_account(cat['child_ids']))
        return lst

    def _ref_lines(self, form):
        result = []
        res = {}
        acc_pool = self.env['account.analytic.account']
        line_pool = self.env['account.analytic.line']

        self.dict_acc_ref = {}
        if form['journal_ids']:
            journal = " in (" + ','.join(map(lambda x: str(x), form['journal_ids'])) + ")"
        else:
            journal = 'is not null'

        query_general = "SELECT id FROM account_analytic_line WHERE (journal_id " + journal + ") AND date>='" + str(form['date1']) + "'"" AND date<='" + str(form['date2']) + "'"

        self.env.cr.execute(query_general)
        l_ids = self.env.cr.fetchall()
        line_ids = [x[0] for x in l_ids]

        obj_line = line_pool.browse(line_ids)

        # this structure will be usefull for easily knowing the account_analytic_line that are related to the reference account. At this purpose, we save the move_id of analytic lines.
        self.dict_acc_ref[form['ref']] = []
        children_list = acc_pool.search([('parent_id', 'child_of', [form['ref']])])
        for obj in obj_line:
            if obj.account_id.id in children_list.ids:
                if obj.move_id and obj.move_id.id not in self.dict_acc_ref[form['ref']]:
                    self.dict_acc_ref[form['ref']].append(obj.move_id.id)

        analytic_account = acc_pool.browse(form['ref'])
        res['ref_name'] = analytic_account.name_get()[0][1]
        res['ref_code'] = analytic_account.code

        self.final_list = children_list.ids
        selected_ids = line_pool.search([('account_id', 'in', self.final_list)]).ids

        res['ref_qty'] = 0.0
        res['ref_amt'] = 0.0
        self.base_amount = 0.0

        if selected_ids:
            query = "SELECT SUM(aal.amount) AS amt, SUM(aal.unit_amount) AS qty FROM account_analytic_line AS aal, account_analytic_account AS aaa \
                    WHERE aal.account_id = aaa.id AND aal.id IN (" + ','.join(map(str, selected_ids)) + ") AND (aal.journal_id " + journal + ") AND aal.date>='" + str(form['date1']) + "'"" AND aal.date<='" + str(form['date2']) + "'"

            self.env.cr.execute(query)
            info = self.env.cr.dictfetchall()
            res['ref_qty'] = info[0]['qty']
            res['ref_amt'] = info[0]['amt']
            self.base_amount = info[0]['amt']
        result.append(res)
        return result

    @api.multi
    def _lines(self, form):
        if form['journal_ids']:
            journal = " in (" + ','.join(map(lambda x: str(x), form['journal_ids'])) + ")"
        else:
            journal = 'is not null'

        acc_pool = self.env['account.analytic.account']
        line_pool = self.env['account.analytic.line']
        final = []
        self.list_ids = []

        self.final_list = self.find_children()

        for account in self.final_list:
            selected_ids = line_pool.search([('account_id', '=', account.id), ('move_id', 'in', self.dict_acc_ref[form['ref']])]).ids
            if selected_ids:
                query = "SELECT aaa.code AS code, SUM(aal.amount) AS amt, SUM(aal.unit_amount) AS qty, aaa.name AS acc_name, aal.account_id AS id FROM account_analytic_line AS aal, account_analytic_account AS aaa \
                WHERE aal.account_id=aaa.id AND aal.id IN (" + ','.join(map(str, selected_ids)) + ") AND (aal.journal_id " + journal + ") AND aal.date>='" + str(form['date1']) + "'"" AND aal.date<='" + str(form['date2']) + "'"" GROUP BY aal.account_id,aaa.name,aaa.code ORDER BY aal.account_id"

                self.cr.execute(query)
                res = self.cr.dictfetchall()
                if res:
                    for element in res:
                        if self.base_amount != 0.00:
                            element['perc'] = (element['amt'] / self.base_amount) * 100.00
                        else:
                            element['perc'] = 0.00
                else:
                    result = {}
                    res = []
                    result['id'] = account.id
                    result['acc_name'] = account.name
                    result['code'] = account.code
                    result['amt'] = result['qty'] = result['perc'] = 0.00
                    if not form['empty_line']:
                        res.append(result)
            else:
                result = {}
                res = []
                result['id'] = account.id
                result['acc_name'] = account.name
                result['code'] = account.code
                result['amt'] = result['qty'] = result['perc'] = 0.00
                if not form['empty_line']:
                    res.append(result)

            for item in res:
                obj_acc = acc_pool.browse(item['id']).name_get()
                item['acc_name'] = obj_acc[0][1]
                final.append(item)
        return final

    @api.multi
    def render_html(self, data=None):
        report_obj = self.env['report']
        report = report_obj._get_report_from_name('account_analytic_plans.report_crossoveredanalyticplans')
        docargs = {
            'doc_ids': self.ids,
            'doc_model': report.model,
            'docs': self,
            'data': data,
            'time': time,
            'lines': self._lines,
            'ref_lines': self._ref_lines(data['form']),
            'find_children': self.find_children
        }
        return report_obj.render('account_analytic_plans.report_crossoveredanalyticplans', docargs)
