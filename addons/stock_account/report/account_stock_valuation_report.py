from collections import defaultdict

from odoo import _, fields, models


class StockValuationReport(models.AbstractModel):
    _inherit = 'account.stock.valuation.report'

    def _get_report_data(self, date=False, product_category=False, warehouse=False):
        # OVERRIDE: add the "Inventory Loss" and "Accruals" sections (both only meaningful
        # when the stock module is installed) and enable the "Generate Entry" (periodic
        # closing) button.
        report_data = super()._get_report_data(date=date, product_category=product_category, warehouse=warehouse)

        date = self._normalize_report_date(date)
        account_ids = set()

        if self._must_include_inventory_loss():
            location_valuation_vals = self._get_inventory_loss_aml_vals(date)
            inventory_loss = {
                'label': _("Inventory Loss"),
                'value': 0,
            }
            lines_by_account_id = defaultdict(lambda: {
                'debit': 0,
                'credit': 0,
            })
            for vals in location_valuation_vals:
                account_ids.add(vals['account_id'])
                debit = vals['balance'] if vals['balance'] > 0 else 0
                credit = -vals['balance'] if vals['balance'] < 0 else 0
                inventory_loss['value'] -= debit
                lines_by_account_id[vals['account_id']]['debit'] += debit
                lines_by_account_id[vals['account_id']]['credit'] += credit
            inventory_loss['lines'] = [{
                'account_id': account_id,
                'debit': vals['debit'],
                'credit': vals['credit'],
            } for (account_id, vals) in lines_by_account_id.items()]
            report_data['inventory_loss'] = inventory_loss

        # valuation_aml_vals (netted out of Stock Variation via
        # `_get_extra_stock_valuation_aml_vals`) is computed together with the
        # display data below and cached, so this doesn't recompute it.
        accrual, __ = self._get_accrual_data(date=date)
        if accrual:
            account_ids.update(line['account_id'] for line in accrual['lines'] if line['account_id'])
            report_data['accrual'] = accrual

        missing_account_ids = account_ids - set(report_data['accounts_by_id'].keys())
        if missing_account_ids:
            accounts_read_data = self.env['account.account'].search_read(
                [('id', 'in', list(missing_account_ids))],
                ['id', 'name', 'code', 'display_name'],
            )
            report_data['accounts_by_id'].update({acc_data['id']: acc_data for acc_data in accounts_read_data})

        return report_data

    def _must_include_inventory_loss(self):
        return bool(self.env['stock.location'].search_count([
            ('usage', '=', 'inventory'),
            ('valuation_account_id', '!=', False),
        ], limit=1))

    def _get_inventory_loss_aml_vals(self, date):
        return self.env.company._get_location_valuation_vals(
            date, location_domain=[('usage', '=', 'inventory')],
        )

    def _get_extra_stock_valuation_aml_vals(self, date):
        # OVERRIDE: also net out location-to-location reclassification entries, and the
        # accrual's stock valuation counterpart, from the Stock Variation section below.
        __, valuation_aml_vals = self._get_accrual_data(date=date)
        return super()._get_extra_stock_valuation_aml_vals(date) + self._get_inventory_loss_aml_vals(date) + valuation_aml_vals

    def _get_accrual_data(self, date=False):
        """ (accrual display data or False, valuation_aml_vals): cached for the transaction
        since `_get_report_data` and `_get_extra_stock_valuation_aml_vals` both need it. """
        company = self.env.company
        cache = self.env.cr.cache.setdefault('account_stock_valuation_report_accrual_data', {})
        key = (company.id, date)
        if key not in cache:
            cache[key] = self._compute_accrual_data(date=date)
        return cache[key]

    def _compute_accrual_data(self, date=False):
        company = self.env.company
        accrual_entry_date = date or fields.Date.context_today(self)
        accrual_labels = {
            'bills_to_receive': _("Bills to Receive"),
            'billed_not_received': _("Billed Not Received"),
            'invoices_to_issue': _("Invoices to be Issued"),
            'invoiced_not_delivered': _("Invoiced Not Delivered"),
        }

        lines_by_key = {}
        valuation_amount_by_account = defaultdict(float)
        for is_purchase, candidate_lines in company._get_accrual_candidate_lines(date=date):
            for __, lines in candidate_lines.grouped('currency_id').items():
                wizard = self.env['account.accrued.orders.wizard'].with_context(
                    active_model=lines._name,
                    active_ids=lines.ids,
                    accrual_entry_date=fields.Date.to_string(accrual_entry_date),
                ).new({
                    'company_id': company.id,
                    'date': accrual_entry_date,
                })
                move_vals, __ = wizard._compute_move_vals()

                # The move's vals carry no product reference per line, so
                # build the account -> product lookup separately.
                valuation_account_ids = set()
                accrual_type_by_account_id = {}
                for product in lines.product_id:
                    accounts = product.product_tmpl_id._get_product_accounts()
                    if accounts.get('stock_valuation'):
                        valuation_account_ids.add(accounts['stock_valuation'].id)
                    for accrual_type in accrual_labels:
                        if accounts.get(accrual_type):
                            accrual_type_by_account_id[accounts[accrual_type].id] = accrual_type

                for __, __, vals in move_vals['line_ids']:
                    amount = vals['debit'] - vals['credit']
                    if company.currency_id.is_zero(amount):
                        continue
                    account_id = vals['account_id']
                    if account_id in valuation_account_ids:
                        valuation_amount_by_account[self.env['account.account'].browse(account_id)] += amount
                        continue
                    accrual_type = accrual_type_by_account_id.get(account_id)
                    if not accrual_type and not account_id:
                        if is_purchase:
                            accrual_type = 'billed_not_received' if amount > 0 else 'bills_to_receive'
                        else:
                            accrual_type = 'invoices_to_issue' if amount > 0 else 'invoiced_not_delivered'
                    if not accrual_type:
                        continue
                    key = (accrual_type, account_id)
                    line = lines_by_key.get(key)
                    if line is None:
                        line = lines_by_key[key] = {
                            'label': accrual_labels[accrual_type],
                            'account_id': account_id,
                            'value': 0,
                        }
                    line['value'] += amount

        account_ids = {line['account_id'] for line in lines_by_key.values() if line['account_id']}
        account_ids |= {account.id for account in valuation_amount_by_account}
        display_name_by_account_id = {
            account.id: account.display_name
            for account in self.env['account.account'].browse(account_ids)
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
            'label': _("Accruals"),
            'value': 0,
            'lines': [
                _line_vals(
                    _(
                        "%(label)s\n%(account)s", label=line['label'], account=display_name_by_account_id[line['account_id']],
                    ) if line['account_id'] else line['label'],
                    line['account_id'],
                    line['value'],
                ) for line in lines_by_key.values()
            ],
        }

        valuation_aml_vals = []
        for account, amount in valuation_amount_by_account.items():
            if company.currency_id.is_zero(amount):
                continue
            valuation_aml_vals.append({
                'account_id': account.id,
                'balance': amount,
            })
            accrual_data['lines'].append(_line_vals(
                display_name_by_account_id[account.id],
                account.id,
                amount,
            ))
            accrual_data['value'] += amount

        # Lines can still net out to nothing to show (e.g. two order lines
        # offsetting each other); valuation_aml_vals is still needed either way.
        if not accrual_data['lines']:
            return False, valuation_aml_vals
        return accrual_data, valuation_aml_vals
