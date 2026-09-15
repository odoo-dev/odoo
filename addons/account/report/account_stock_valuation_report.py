from collections import defaultdict

from odoo import api, fields, models


class StockValuationReport(models.AbstractModel):
    _name = 'account.stock.valuation.report'
    _description = 'Stock Valuation'

    @api.model
    def get_report_values(self, date=False):
        return {
            'data': self.with_context(allowed_company_ids=self.env.company.ids)._get_report_data(date=date),
            'context': {},
        }

    def _normalize_report_date(self, date):
        if isinstance(date, str):
            date = fields.Date.from_string(date)
        if date == fields.Date.context_today(self):
            date = False
        return date

    def _get_report_data(self, date=False, product_category=False, warehouse=False):
        company = self.env.company
        date = self._normalize_report_date(date)

        inventory_data = company.get_inventory_value(at_date=date)
        accounting_data = company.get_inventory_accounting_value(at_date=date)

        accounts = inventory_data.keys() | accounting_data.keys()
        account_ids = {acc.id for acc in accounts}

        initial_balance = {
            'label': self.env._("Initial Balance"),
            'value': 0,
            'lines_by_account_id': defaultdict(lambda: {
                'value': 0,
            }),
        }
        ending_stock = {
            'label': self.env._("Ending Stock"),
            'value': 0,
            'lines_by_account_id': defaultdict(lambda: {
                'value': 0,
            }),
        }
        for account in accounts:
            opening_balance = accounting_data.get(account, 0)
            ending_balance = inventory_data.get(account, 0)
            if opening_balance:
                initial_balance['value'] += opening_balance
                initial_balance['lines_by_account_id'][account.id]['value'] += opening_balance
            if ending_balance:
                ending_stock['value'] += ending_balance
                ending_stock['lines_by_account_id'][account.id]['value'] += ending_balance

        report_data = {
            'company_id': company.id,
            'currency_id': company.currency_id.id,
            'ending_stock': ending_stock,
            'initial_balance': initial_balance,
        }

        accrual, pending_cogs_vals = self._get_accrual_data(date=date)
        if accrual:
            account_ids.update(self._get_line_account_ids(accrual['lines']))
            report_data['accrual'] = accrual

        extra_aml_vals_list = self._get_extra_stock_valuation_aml_vals(date)
        stock_variation = {
            'label': self.env._("Stock Variation"),
            'value': 0,
            'lines': [],
        }
        if company.use_stock_account():
            stock_valuation_account_vals = company.with_context(inventory_data=inventory_data)._get_stock_valuation_account_vals(
                date, extra_aml_vals_list)
            lines_by_account_id = defaultdict(float)
            for vals in stock_valuation_account_vals:
                account_ids.add(vals['account_id'])
                stock_variation['value'] += vals['balance']
                lines_by_account_id[vals['account_id']] += vals['balance']
            stock_variation['lines'] = [{
                'account_id': account_id,
                'debit': balance if balance > 0 else 0,
                'credit': -balance if balance < 0 else 0,
            } for (account_id, balance) in lines_by_account_id.items()]
        else:
            pending_vals = company.with_context(inventory_data=inventory_data)._get_stock_valuation_account_vals(
                date, extra_aml_vals_list) + pending_cogs_vals
            for vals in pending_vals:
                ending_stock['value'] += vals['balance']
                ending_stock['lines_by_account_id'][vals['account_id']]['value'] += vals['balance']
                account_ids.add(vals['account_id'])

        accounts_read_data = self.env['account.account'].search_read(
            [('id', 'in', account_ids)],
            ['id', 'name', 'code', 'display_name']
        )
        report_data.update(
            accounts_by_id={acc_data['id']: acc_data for acc_data in accounts_read_data},
            stock_variation=stock_variation,
        )
        return report_data

    def _get_line_account_ids(self, lines):
        """ Account ids referenced anywhere in `lines`, including nested sublines (a line's
        'lines' key), so `accounts_by_id` covers them for display. """
        account_ids = set()
        for line in lines:
            if line.get('account_id'):
                account_ids.add(line['account_id'])
            if line.get('lines'):
                account_ids.update(self._get_line_account_ids(line['lines']))
        return account_ids

    def _get_extra_stock_valuation_aml_vals(self, date):
        """ Extra debit/credit vals already accounted for elsewhere, to subtract when computing
        the stock variation so it isn't double-counted (e.g. location-to-location
        reclassification entries).
        """
        return []

    def _get_accrual_data(self, date=False):
        """ (accrual display data or False, pending_cogs_vals) """
        company = self.env.company
        accrual_entry_date = date or fields.Date.context_today(self)
        accrual_labels = {
            'bills_to_receive': self.env._("Bills to Receive"),
            'billed_not_received': self.env._("Billed Not Received"),
            'invoices_to_issue': self.env._("Invoices to be Issued"),
            'invoiced_not_delivered': self.env._("Invoiced Not Delivered"),
        }

        def _line_vals(display_name, account_id, value):
            # No 'value' key: the debit/credit split must drive the display,
            # or the signed value overrides it (StockValuationReportLine.formattedValue).
            return {
                'display_name': display_name,
                'account_id': account_id,
                'debit': value if value > 0 else 0,
                'credit': -value if value < 0 else 0,
            }

        accrual_data = {
            'label': self.env._("Accruals"),
            'value': 0,
            'lines': [],
        }
        pending_cogs_vals = []

        for accrual_type, candidate_lines in company._get_accrual_candidate_lines(date=date).items():
            if not candidate_lines:
                continue

            wizard = self.env['account.accrued.orders.wizard'].with_context(
                active_model=candidate_lines._name,
                active_ids=candidate_lines.ids,
                accrual_entry_date=fields.Date.to_string(accrual_entry_date),
                accrual_allow_mixed_currencies=True,
            ).new({
                'company_id': company.id,
                'date': accrual_entry_date,
            })
            is_purchase = candidate_lines._name == 'purchase.order.line'

            # Fold the pending COGS (real-time) and closing correction (periodic) impact
            # into Ending Stock, whether or not this bucket also shows up below.
            cogs_vals_list, cogs_counterpart_vals_list = wizard._get_accrual_pending_cogs_vals(
                candidate_lines, is_purchase, accrual_entry_date)
            closing_vals_list, closing_counterpart_vals_list = wizard._get_accrual_closing_correction_vals(
                candidate_lines, is_purchase, accrual_entry_date)
            pending_cogs_vals += [
                {'account_id': vals['account_id'], 'balance': vals['debit'] - vals['credit']}
                for vals in cogs_vals_list + cogs_counterpart_vals_list + closing_vals_list + closing_counterpart_vals_list
            ]

            # Only real-time, storable products' accrual lands on `stock_valuation`
            # (`_get_accrual_main_line_vals`): periodic has no place in a *stock* report.
            stock_lines = candidate_lines.filtered(lambda l: l.product_id.valuation == 'real_time' and l.product_id.is_storable)
            if not stock_lines:
                continue

            # A purchase bill only ever touches `stock_valuation` (no expense line), so the
            # meaningful nested breakdown is the accrual counterpart account. A sale invoice
            # posts a separate COGS/expense entry, which is the meaningful one there instead.
            if is_purchase:
                main_vals_list, nested_vals_list = wizard._get_accrual_main_line_vals(stock_lines, is_purchase, accrual_entry_date)
                pending_cogs_vals += [
                    {'account_id': vals['account_id'], 'balance': vals['debit'] - vals['credit']}
                    for vals in main_vals_list
                ]
            else:
                nested_vals_list = cogs_counterpart_vals_list

            type_valuation_amount_by_account = defaultdict(float)
            for vals in nested_vals_list:
                amount = vals['debit'] - vals['credit']
                if company.currency_id.is_zero(amount):
                    continue
                account = self.env['account.account'].browse(vals['account_id'])
                type_valuation_amount_by_account[account] += amount
            if not type_valuation_amount_by_account:
                continue

            type_line = _line_vals(
                accrual_labels[accrual_type],
                False,
                sum(type_valuation_amount_by_account.values()),
            )
            type_line['lines'] = [
                _line_vals(account.display_name, account.id, amount)
                for account, amount in type_valuation_amount_by_account.items()
            ]
            accrual_data['lines'].append(type_line)

        if not accrual_data['lines']:
            return False, pending_cogs_vals
        accrual_data['value'] = sum(line['debit'] - line['credit'] for line in accrual_data['lines'])
        return accrual_data, pending_cogs_vals
