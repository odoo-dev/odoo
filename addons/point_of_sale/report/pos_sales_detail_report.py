import datetime
from collections import defaultdict

from odoo import _, fields, models

from .pos_report_handler import report_section


class PosSalesDetailReport(models.AbstractModel):
    _name = 'pos.sales.detail.report'
    _inherit = 'pos.report.handler'
    _description = 'POS Sales Detail Report Handler'

    def _get_filters(self):
        return [
            {'type': 'date_range', 'default': 'month'},
            {'type': 'multi_select', 'field': 'config_ids', 'model': 'pos.config', 'label': 'Point of Sale'},
            {'type': 'single_select', 'field': 'session_ids', 'model': 'pos.session', 'label': 'Session'},
        ]

    def _get_sections_columns(self):
        return {
            'sales': [
                {'id': 'qty', 'label': _('Qty'), 'type': 'integer', 'align': 'right'},
                {'id': 'amount_total', 'label': _('Total'), 'type': 'monetary', 'align': 'right'},
            ],
            'refunds': [
                {'id': 'qty', 'label': _('Qty'), 'type': 'integer', 'align': 'right'},
                {'id': 'amount_total', 'label': _('Total'), 'type': 'monetary', 'align': 'right'},
            ],
            'taxes_sales': [
                {'id': 'tax_amount', 'label': _('Tax'), 'type': 'monetary', 'align': 'right'},
                {'id': 'base_amount', 'label': _('Base'), 'type': 'monetary', 'align': 'right'},
            ],
            'taxes_refunds': [
                {'id': 'tax_amount', 'label': _('Tax'), 'type': 'monetary', 'align': 'right'},
                {'id': 'base_amount', 'label': _('Base'), 'type': 'monetary', 'align': 'right'},
            ],
            'payments': [
                {'id': 'amount_total', 'label': _('Amount'), 'type': 'monetary', 'align': 'right'},
            ],
            'discounts': [
                {'id': 'count', 'label': _('Count'), 'type': 'integer', 'align': 'right'},
                {'id': 'amount', 'label': _('Amount'), 'type': 'monetary', 'align': 'right'},
            ],
            'invoices': [
                {'id': 'count', 'label': _('Count'), 'type': 'integer', 'align': 'right'},
                {'id': 'amount_total', 'label': _('Total'), 'type': 'monetary', 'align': 'right'},
            ],
            'session_control': [
                {'id': 'expected', 'label': _('Expected'), 'type': 'monetary', 'align': 'right'},
                {'id': 'counted', 'label': _('Counted'), 'type': 'monetary', 'align': 'right'},
                {'id': 'difference', 'label': _('Diff'), 'type': 'monetary', 'align': 'right'},
            ],
            'opening_notes': [
                {'id': 'note', 'label': _('Note'), 'type': 'string', 'align': 'left'},
            ],
            'closing_notes': [
                {'id': 'note', 'label': _('Note'), 'type': 'string', 'align': 'left'},
            ],
        }

    @report_section(id='sales', name='Sales', sequence=10, foldability="expanded")
    def _section_sales(self, options):
        domain = self._get_sale_line_domain(options, is_refund=False)
        lines = self.env['pos.order.line'].search(domain)
        qty = amount = 0.0
        for line in lines:
            if self._is_discount_product(line):
                continue
            qty += abs(line.qty)
            amount += self._get_product_total_amount(line)
        return {
            'name': _('Sales'), 'level': 0,
            'foldability': 'expanded' if lines else 'static', 'style': 'bold',
            'qty': qty, 'amount_total': amount,
        }

    @report_section(id='category', parent='sales')
    def _section_sales_categories(self, unfold_context, options):
        domain = self._get_sale_line_domain(options, is_refund=False)
        lines = self.env['pos.order.line'].search(domain)
        cat_data = defaultdict(lambda: {'qty': 0.0, 'amount_total': 0.0})
        for line in lines:
            if self._is_discount_product(line):
                continue
            categ = line.product_id.product_tmpl_id.pos_categ_ids[:1]
            key = (categ.name if categ else _('Not Categorized'), categ.id if categ else 0)
            cat_data[key]['qty'] += abs(line.qty)
            cat_data[key]['amount_total'] += self._get_product_total_amount(line)
        result = []
        for (name, cid) in sorted(cat_data, key=lambda k: str(k[0] or '')):
            d = cat_data[(name, cid)]
            result.append({
                'record_id': cid,
                'name': name, 'level': 1,
                'foldability': 'collapsed', 'style': 'bold',
                'qty': d['qty'], 'amount_total': d['amount_total'],
            })
        return result

    @report_section(id='product', parent='category')
    def _section_sales_products(self, unfold_context, options):
        category_id = unfold_context['record_id']
        domain = self._get_sale_line_domain(options, is_refund=False)
        domain += [('product_id.product_tmpl_id.pos_categ_ids', 'in', [category_id])]
        return self._build_product_lines(domain)

    # ── Refunds ───────────────────────────────────────────────────────────────

    @report_section(id='refunds', name='Refunds', sequence=15)
    def _section_refunds(self, options):
        domain = self._get_sale_line_domain(options, is_refund=True)
        lines = self.env['pos.order.line'].search(domain)
        qty = amount = 0.0
        for line in lines:
            if self._is_discount_product(line):
                continue
            qty += abs(line.qty)
            amount += self._get_product_total_amount(line)
        return {
            'name': _('Refunds'), 'level': 0,
            'foldability': 'collapsed' if lines else 'static', 'style': 'bold',
            'qty': qty, 'amount_total': amount,
        }

    @report_section(id='refund_category', parent='refunds')
    def _section_refunds_categories(self, unfold_context, options):
        domain = self._get_sale_line_domain(options, is_refund=True)
        lines = self.env['pos.order.line'].search(domain)
        cat_data = defaultdict(lambda: {'qty': 0.0, 'amount_total': 0.0})
        for line in lines:
            if self._is_discount_product(line):
                continue
            categ = line.product_id.product_tmpl_id.pos_categ_ids[:1]
            key = (categ.name if categ else _('Not Categorized'), categ.id if categ else 0)
            cat_data[key]['qty'] += abs(line.qty)
            cat_data[key]['amount_total'] += self._get_product_total_amount(line)
        result = []
        for (name, cid) in sorted(cat_data, key=lambda k: str(k[0] or '')):
            d = cat_data[(name, cid)]
            result.append({
                'record_id': cid,
                'name': name, 'level': 1,
                'foldability': 'collapsed', 'style': 'bold',
                'qty': d['qty'], 'amount_total': d['amount_total'],
            })
        return result

    @report_section(id='refund_product', parent='refund_category')
    def _section_refunds_products(self, unfold_context, options):
        category_id = unfold_context['record_id']
        domain = self._get_sale_line_domain(options, is_refund=True)
        domain += [('product_id.product_tmpl_id.pos_categ_ids', 'in', [category_id])]
        return self._build_product_lines(domain)

    # ── Taxes on Sales ────────────────────────────────────────────────────────

    @report_section(id='taxes_sales', name='Taxes on Sales', sequence=20)
    def _section_taxes_sales(self, options):
        domain = self._get_sale_line_domain(options, is_refund=False)
        data = self.env['pos.order.line']._read_group(domain, [], ['price_subtotal:sum', 'price_subtotal_incl:sum'])
        base = data[0][0] if data else 0.0
        tax = (data[0][1] if data else 0.0) - base
        return {
            'name': _('Taxes on Sales'), 'level': 0,
            'foldability': 'collapsed', 'style': 'bold',
            'tax_amount': tax, 'base_amount': base,
        }

    @report_section(id='tax_line', parent='taxes_sales')
    def _section_taxes_sales_lines(self, unfold_context, options):
        return self._build_tax_lines(options, is_refund=False)

    # ── Taxes on Refunds ──────────────────────────────────────────────────────

    @report_section(id='taxes_refunds', name='Taxes on Refunds', sequence=25)
    def _section_taxes_refunds(self, options):
        domain = self._get_sale_line_domain(options, is_refund=True)
        data = self.env['pos.order.line']._read_group(domain, [], ['price_subtotal:sum', 'price_subtotal_incl:sum'])
        base = abs(data[0][0]) if data else 0.0
        tax = abs((data[0][1] if data else 0.0) - (data[0][0] if data else 0.0))
        return {
            'name': _('Taxes on Refunds'), 'level': 0,
            'foldability': 'collapsed', 'style': 'bold',
            'tax_amount': tax, 'base_amount': base,
        }

    @report_section(id='refund_tax_line', parent='taxes_refunds')
    def _section_taxes_refunds_lines(self, unfold_context, options):
        return self._build_tax_lines(options, is_refund=True)

    # ── Payments ──────────────────────────────────────────────────────────────

    @report_section(id='payments', name='Payments', sequence=30)
    def _section_payments(self, options):
        order_ids = self._get_filtered_order_ids(options)
        data = self.env['pos.payment']._read_group([('pos_order_id', 'in', order_ids)], [], ['amount:sum']) if order_ids else []
        return {
            'name': _('Payments'), 'level': 0,
            'foldability': 'collapsed' if order_ids else 'static', 'style': 'bold',
            'amount_total': data[0][0] if data else 0.0,
        }

    @report_section(id='payment_method', parent='payments')
    def _section_payments_methods(self, unfold_context, options):
        order_ids = self._get_filtered_order_ids(options)
        if not order_ids:
            return []
        groups = self.env['pos.payment']._read_group(
            [('pos_order_id', 'in', order_ids)],
            ['session_id', 'payment_method_id'], ['amount:sum'],
        )
        method_totals = defaultdict(float)
        session_lines, method_records = [], {}
        for session, method, total in groups:
            method_totals[method.id] += total
            method_records[method.id] = method
            session_lines.append({
                'record_id': f'{method.id}_{session.id}',
                'name': f'{method.name} ({session.name})', 'level': 1,
                'foldability': 'static', 'style': 'normal',
                'amount_total': total,
            })
        total_lines = [
            {
                'record_id': mid,
                'name': method_records[mid].name, 'level': 1,
                'foldability': 'static', 'style': 'bold',
                'amount_total': total,
            }
            for mid, total in method_totals.items()
        ]
        return session_lines + total_lines

    # ── Discounts ─────────────────────────────────────────────────────────────

    @report_section(id='discounts', name='Discounts', sequence=40)
    def _section_discounts(self, options):
        domain = [('state', 'in', ['paid', 'done', 'invoiced'])]
        if options.get('date_from'):
            domain += [('date_order', '>=', options['date_from'])]
        if options.get('date_to'):
            domain += [('date_order', '<=', options['date_to'])]
        if options.get('config_ids'):
            domain += [('config_id', 'in', options['config_ids'])]
        if options.get('session_ids'):
            domain += [('session_id', 'in', options['session_ids'])]
        orders = self.env['pos.order'].search(domain)
        disc_orders = orders.filtered(lambda o: o.lines.filtered(lambda l: l.discount > 0))
        disc_amount = sum(l._get_discount_amount() for l in orders.lines.filtered(lambda l: l.discount > 0))
        return {
            'name': _('Discounts'), 'level': 0,
            'foldability': 'static', 'style': 'bold',
            'count': len(disc_orders), 'amount': disc_amount,
        }

    # ── Invoices ──────────────────────────────────────────────────────────────

    @report_section(id='invoices', name='Invoices', sequence=45)
    def _section_invoices(self, options):
        order_ids = self._get_filtered_order_ids(options)
        invoiced = self.env['pos.order'].search([('id', 'in', order_ids), ('account_move', '!=', False)]) if order_ids else self.env['pos.order']
        return {
            'name': _('Invoices'), 'level': 0,
            'foldability': 'collapsed' if invoiced else 'static', 'style': 'bold',
            'count': len(invoiced), 'amount_total': sum(invoiced.mapped('amount_paid')),
        }

    @report_section(id='invoice_session', parent='invoices')
    def _section_invoices_sessions(self, unfold_context, options):
        order_ids = self._get_filtered_order_ids(options)
        if not order_ids:
            return []
        groups = self.env['pos.order']._read_group([('id', 'in', order_ids)], ['session_id'], [])
        result = []
        for (session,) in groups:
            inv_list = session._get_invoice_total_list()
            if not inv_list:
                continue
            result.append({
                'record_id': session.id,
                'name': session.name, 'level': 1,
                'foldability': 'collapsed', 'style': 'bold',
                'count': len(inv_list), 'amount_total': sum(i['total'] for i in inv_list),
            })
        return result

    @report_section(id='invoice_line', parent='invoice_session')
    def _section_invoices_lines(self, unfold_context, options):
        session_id = unfold_context['record_id']
        inv_list = self.env['pos.session'].browse(session_id)._get_invoice_total_list()
        return [
            {
                'record_id': idx,
                'name': inv.get('name', ''), 'level': 2,
                'foldability': 'static', 'style': 'normal',
                'count': 1, 'amount_total': inv.get('total', 0.0),
                'order_ref': inv.get('order_ref', ''),
            }
            for idx, inv in enumerate(inv_list)
        ]

    # ── Session Control ───────────────────────────────────────────────────────

    @report_section(id='session_control', name='Session Control', sequence=50)
    def _section_session_control(self, options):
        order_ids = self._get_filtered_order_ids(options)
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        currency = self._resolve_currency(options)
        total_paid = sum(orders.mapped('amount_paid'))
        return {
            'name': _('Session Control'), 'level': 0,
            'foldability': 'collapsed', 'style': 'bold',
            'expected': total_paid, 'counted': total_paid,
            'difference': self._compute_cash_rounding(order_ids, currency),
        }

    @report_section(id='sc_method', parent='session_control')
    def _section_session_control_payments(self, unfold_context, options):
        order_ids = self._get_filtered_order_ids(options)
        if not order_ids:
            return []
        session_groups = self.env['pos.order']._read_group([('id', 'in', order_ids)], ['session_id'], [])
        result = []
        for (session,) in session_groups:
            method_groups = self.env['pos.payment']._read_group(
                [('session_id', '=', session.id), ('pos_order_id', 'in', order_ids)],
                ['payment_method_id'], ['amount:sum'],
            )
            for method, expected in method_groups:
                counted = difference = 0.0
                has_moves = False
                if method.type == 'cash':
                    difference = session.closing_balance - (expected + (session.opening_balance or 0.0))
                    has_moves = True
                else:
                    acct_pays = self.env['account.payment'].search([
                        ('pos_session_id', '=', session.id), ('pos_payment_method_id', '=', method.id),
                    ])
                    if acct_pays:
                        counted = sum(acct_pays.mapped('amount_signed'))
                        difference = counted - expected
                        has_moves = abs(difference) > 0.0
                    else:
                        move = self.env['account.move'].search(
                            [('ref', '=', _("Closing difference in %s (%s)", method.name, session.name))], limit=1)
                        if move:
                            is_loss = any(l.account_id == method.journal_id.loss_account_id for l in move.line_ids)
                            difference = -move.amount_total if is_loss else move.amount_total
                            counted = expected + difference
                            has_moves = True
                result.append({
                    'record_id': f'{session.id}_{method.id}',
                    'name': f'{method.name} ({session.name})', 'level': 1,
                    'foldability': 'collapsed' if has_moves else 'static', 'style': 'normal',
                    'expected': expected, 'counted': counted, 'difference': difference,
                    '_session_id': session.id, '_method_id': method.id,
                })
        return result

    @report_section(id='sc_move', parent='sc_method')
    def _section_session_control_cash_moves(self, unfold_context, options):
        record_id = unfold_context['record_id']
        session_id, method_id = (int(x) for x in record_id.split('_', 1))
        session = self.env['pos.session'].browse(session_id)
        method = self.env['pos.payment.method'].browse(method_id)
        if method.type == 'cash':
            return self._build_cash_moves_cash(session, method)
        return self._build_cash_moves_non_cash(session, method)

    # ── Opening / Closing Notes ───────────────────────────────────────────────

    @report_section(id='opening_notes', name='Opening Notes', sequence=60)
    def _section_opening_notes(self, options):
        order_ids = self._get_filtered_order_ids(options)
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        sessions = orders.mapped('session_id')
        note = sessions[:1].opening_notes if len(sessions) == 1 and sessions[:1].opening_notes else ''
        return {
            'name': _('Opening Notes'), 'level': 0,
            'foldability': 'static', 'style': 'normal',
            'note': note,
        }

    @report_section(id='closing_notes', name='Closing Notes', sequence=70)
    def _section_closing_notes(self, options):
        order_ids = self._get_filtered_order_ids(options)
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        sessions = orders.mapped('session_id')
        note = sessions[:1].closing_notes if len(sessions) == 1 and sessions[:1].closing_notes else ''
        return {
            'name': _('Closing Notes'), 'level': 0,
            'foldability': 'static', 'style': 'normal',
            'note': note,
        }

    # ── Shared builders ───────────────────────────────────────────────────────

    def _build_product_lines(self, domain):
        lines = self.env['pos.order.line'].search(domain)
        prod_data = defaultdict(lambda: {'qty': 0.0, 'amount_total': 0.0, 'discount': 0.0,
                                         'uom': 'Units', 'barcode': False, 'combo_label': ''})
        for line in lines:
            if self._is_discount_product(line):
                continue
            key = (line.product_id.id, line.price_unit, line.discount)
            d = prod_data[key]
            d['qty'] += abs(line.qty)
            d['amount_total'] += self._get_product_total_amount(line)
            d['discount'] = line.discount
            d['uom'] = line.product_id.uom_id.name
            d['barcode'] = line.product_id.barcode or d['barcode']
            if line.combo_line_ids:
                d['combo_label'] = ' (' + ', '.join(line.combo_line_ids.product_id.mapped('name')) + ')'
        result = []
        for (pid, price, disc), d in prod_data.items():
            product = self.env['product.product'].browse(pid)
            uid = f'{pid}_{price}_{disc}'.replace('.', '_')
            result.append({
                'record_id': uid,
                'name': product.display_name,
                'level': 2,
                'foldability': 'static',
                'style': 'normal',
                'qty': d['qty'],
                'amount_total': d['amount_total'],
                'discount': d['discount'],
                'uom': d['uom'],
                'barcode': d['barcode'],
                'combo_label': d['combo_label'],
            })
        return sorted(result, key=lambda l: l['name'])

    def _build_tax_lines(self, options, is_refund):
        domain = self._get_sale_line_domain(options, is_refund=is_refund)
        lines = self.env['pos.order.line'].search(domain)
        currency = self._resolve_currency(options)
        taxes = {}
        for line in lines:
            if self._is_discount_product(line):
                continue
            if line.tax_ids_after_fiscal_position:
                computed = line.tax_ids_after_fiscal_position.sudo().compute_all(
                    line.price_unit * (1 - (line.discount or 0.0) / 100.0),
                    currency, line.qty, product=line.product_id,
                    partner=line.order_id.partner_id or False,
                )
                for tax in computed['taxes']:
                    taxes.setdefault(tax['id'], {'name': tax['name'], 'tax_amount': 0.0, 'base_amount': 0.0})
                    taxes[tax['id']]['tax_amount'] += tax['amount']
                    taxes[tax['id']]['base_amount'] += currency.round(tax['base'])
            else:
                taxes.setdefault(0, {'name': _('No Taxes'), 'tax_amount': 0.0, 'base_amount': 0.0})
                taxes[0]['base_amount'] += line.price_subtotal_incl
        return [
            {
                'record_id': tid,
                'name': t['name'], 'level': 1,
                'foldability': 'static', 'style': 'normal',
                'tax_amount': t['tax_amount'], 'base_amount': t['base_amount'],
            }
            for tid, t in taxes.items()
        ]

    def _build_cash_moves_cash(self, session, method):
        cash_moves = self.env['account.bank.statement.line'].search([('pos_session_id', '=', session.id)])
        result = []
        if session.opening_balance > 0:
            result.append({
                'record_id': 'opening',
                'name': _('Cash Opening'), 'level': 2,
                'foldability': 'static', 'style': 'normal',
                'amount_total': session.cash_register_balance_start,
            })
        counter = 0
        for move in cash_moves:
            if move.move_id.journal_id.id != method.journal_id.id:
                continue
            counter += 1
            name = move.payment_ref or (f'Cash in {counter}' if move.amount > 0 else f'Cash out {counter}')
            result.append({
                'record_id': move.id,
                'name': name, 'level': 2,
                'foldability': 'static', 'style': 'normal',
                'amount_total': move.amount,
            })
        return result

    def _build_cash_moves_non_cash(self, session, method):
        acct_pays = self.env['account.payment'].search([
            ('pos_session_id', '=', session.id), ('pos_payment_method_id', '=', method.id),
        ])
        result = []
        if acct_pays:
            counted = sum(acct_pays.mapped('amount_signed'))
            expected = sum(self.env['pos.payment'].search([
                ('session_id', '=', session.id), ('payment_method_id', '=', method.id),
            ]).mapped('amount'))
            diff = counted - expected
            if diff != 0.0:
                result.append({
                    'record_id': 'diff',
                    'name': _('Difference observed during the counting (%s)', 'Profit' if diff > 0 else 'Loss'),
                    'level': 2,
                    'foldability': 'static', 'style': 'normal',
                    'amount_total': diff,
                })
        else:
            move = self.env['account.move'].search(
                [('ref', '=', _("Closing difference in %s (%s)", method.name, session.name))], limit=1)
            if move:
                is_loss = any(l.account_id == method.journal_id.loss_account_id for l in move.line_ids)
                result.append({
                    'record_id': move.id,
                    'name': _('Difference observed during the counting (%s)', 'Loss' if is_loss else 'Profit'),
                    'level': 2,
                    'foldability': 'static', 'style': 'normal',
                    'amount_total': -move.amount_total if is_loss else move.amount_total,
                })
        return result

    def _get_sale_line_domain(self, options, is_refund=False):
        domain = [('order_id.state', 'in', ['paid', 'done']), ('order_id.is_refund', '=', is_refund)]
        if options.get('session_ids'):
            domain += [('order_id.session_id', 'in', options['session_ids'])]
        else:
            if options.get('date_from'):
                domain += [('order_id.date_order', '>=', options['date_from'])]
            if options.get('date_to'):
                domain += [('order_id.date_order', '<=', options['date_to'])]
            if options.get('config_ids'):
                domain += [('order_id.config_id', 'in', options['config_ids'])]
        return domain

    def _get_filtered_order_ids(self, options):
        domain = [('state', 'in', ['paid', 'done', 'invoiced'])]
        if options.get('date_from'):
            domain += [('date_order', '>=', options['date_from'])]
        if options.get('date_to'):
            domain += [('date_order', '<=', options['date_to'])]
        if options.get('config_ids'):
            domain += [('config_id', 'in', options['config_ids'])]
        if options.get('session_ids'):
            domain += [('session_id', 'in', options['session_ids'])]
        return self.env['pos.order'].search(domain).ids

    def _is_discount_product(self, line):
        order = line.order_id
        return order.config_id.module_pos_discount and line.product_id.id == order.config_id.discount_product_id.id

    def _resolve_currency(self, options):
        config_ids = options.get('config_ids')
        session_ids = options.get('session_ids')
        if config_ids:
            currencies = self.env['pos.config'].browse(config_ids).mapped('currency_id')
        elif session_ids:
            currencies = self.env['pos.session'].browse(session_ids).mapped('config_id.currency_id')
        else:
            currencies = self.env['pos.config'].search([]).mapped('currency_id')
        if currencies and all(c == currencies[0] for c in currencies):
            return currencies[0]
        return self.env.company.currency_id

    def _compute_cash_rounding(self, order_ids, user_currency):
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        total = 0.0
        for order in orders:
            order_currency = order.session_id.currency_id
            diff = order.amount_paid - order.amount_total
            total += order_currency._convert(diff, user_currency, order.company_id,
                                              order.date_order or fields.Date.today()) \
                if user_currency != order_currency else diff
        return user_currency.round(total) if user_currency else total

    def _get_product_total_amount(self, line):
        return line.currency_id.round(line.price_unit * line.qty * (100 - line.discount) / 100.0)
