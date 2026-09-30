from collections import defaultdict

from odoo import _, api, fields, models
from odoo.fields import Domain
from odoo.tools import SQL

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

    def _get_currency(self):
        """Determine the report display currency based on selected POS configs/sessions."""
        if config_ids := self.env.context.get('config_ids'):
            currencies = self.env['pos.config'].browse(config_ids).mapped('currency_id')
        elif session_ids := self.env.context.get('session_ids'):
            currencies = self.env['pos.session'].browse(session_ids).mapped('config_id.currency_id')
        else:
            currencies = self.env['pos.config'].search([]).mapped('currency_id')

        if currencies and len(set(currencies.ids)) == 1:
            return currencies[0]
        return self.env.company.currency_id

    def _get_sale_line_totals(self, is_refund=False, group_field=None):
        """Get sale line totals grouped by the given field."""
        query = self.env['pos.order.line']._search(self._get_sale_line_domain(is_refund=is_refund))

        line_table = query.table
        order_table = line_table._join('order_id')
        config_table = order_table._join('config_id')

        query.add_where(
            SQL(
                "NOT (%s IS TRUE AND %s = %s)",
                config_table['module_pos_discount'],
                line_table['product_id'],
                config_table['discount_product_id'],
            ),
        )

        group_by = [
            config_table['currency_id'],
            line_table['company_id'],
            SQL("CAST(%s AS date)", order_table['date_order']),
        ]

        if group_field:
            group_by.append(line_table[group_field])
        query.groupby = SQL(", ").join(group_by)

        rows = self.env.execute_query(
            query.select(
                SQL("COALESCE(SUM(ABS(%s)), 0.0)", line_table['qty']),
                SQL(
                    "COALESCE(SUM(COALESCE(%s, 0.0) * COALESCE(%s, 0.0) "
                    "* (100.0 - COALESCE(%s, 0.0)) / 100.0), 0.0)",
                    line_table['price_unit'], line_table['qty'], line_table['discount'],
                ),
                *group_by,
            ),
        )

        totals = defaultdict(lambda: [0.0, 0.0])
        for qty, amount, curr_id, comp_id, date_order, *group in rows:
            total = totals[group[0] if group else 'default']
            total[0] += qty
            total[1] += self._convert_to_report_currency(amount, curr_id, comp_id, date_order)
        return totals

    @report_section(id='sales', name='Sales', sequence=10, foldability="expanded")
    def _section_sales(self):
        qty, amount = self._get_sale_line_totals().get('default', [0.0, 0.0])

        return {
            'name': _('Sales'),
            'foldability': 'expanded' if (qty or amount) else 'static',
            'style': 'bold',
            'qty': qty,
            'amount_total': self._get_currency().round(amount),
        }

    @report_section(id='category', parent='sales')
    def _section_sales_categories(self):
        product_totals = self._get_sale_line_totals(group_field='product_id')
        products = self.env['product.product'].browse(list(product_totals))

        names = {}
        totals = defaultdict(lambda: [0.0, 0.0])
        for product in products:
            category = product.product_tmpl_id.pos_categ_ids[:1]
            names[category.id or 0] = category.name or _('Not Categorized')
            qty, amount = product_totals[product.id]
            totals[category.id or 0][0] += qty
            totals[category.id or 0][1] += amount

        return [
            {
                'record_id': cid,
                'name': names[cid],
                'foldability': 'collapsed',
                'style': 'bold',
                'qty': totals[cid][0],
                'amount_total': self._get_currency().round(totals[cid][1]),
            }
            for cid in sorted(names, key=lambda cid: str(names[cid] or ''))
        ]

    @report_section(id='product', parent='category')
    def _section_sales_products(self):
        category_id = self.env.context.get('record_id')
        domain = self._get_sale_line_domain(is_refund=False)
        domain += [('product_id.product_tmpl_id.pos_categ_ids', 'in', [category_id])]
        return self._build_product_lines(domain)

    @report_section(id='refunds', name='Refunds', sequence=15)
    def _section_refunds(self):
        qty, amount = self._get_sale_line_totals(is_refund=True).get('default', [0.0, 0.0])

        return {
            'name': _('Refunds'),
            'foldability': 'collapsed' if (qty or amount) else 'static',
            'style': 'bold',
            'qty': qty,
            'amount_total': self._get_currency().round(amount),
        }

    @report_section(id='refund_category', parent='refunds')
    def _section_refunds_categories(self):
        product_totals = self._get_sale_line_totals(is_refund=True, group_field='product_id')
        products = self.env['product.product'].browse(list(product_totals))

        names = {}
        totals = defaultdict(lambda: [0.0, 0.0])
        for product in products:
            category = product.product_tmpl_id.pos_categ_ids[:1]
            names[category.id or 0] = category.name or _('Not Categorized')
            qty, amount = product_totals[product.id]
            totals[category.id or 0][0] += qty
            totals[category.id or 0][1] += amount

        return [
            {
                'record_id': cid,
                'name': names[cid],
                'foldability': 'collapsed',
                'style': 'bold',
                'qty': totals[cid][0],
                'amount_total': self._get_currency().round(totals[cid][1]),
            }
            for cid in sorted(names, key=lambda cid: str(names[cid] or ''))
        ]

    @report_section(id='refund_product', parent='refund_category')
    def _section_refunds_products(self):
        category_id = self.env.context.get('record_id')
        domain = self._get_sale_line_domain(is_refund=True)
        domain += [('product_id.product_tmpl_id.pos_categ_ids', 'in', [category_id])]
        return self._build_product_lines(domain)

    @report_section(id='taxes_sales', name='Taxes on Sales', sequence=20)
    def _section_taxes_sales(self):
        domain = self._get_sale_line_domain(is_refund=False)
        data = self.env['pos.order.line']._read_group(domain, [], ['price_subtotal:sum', 'price_subtotal_incl:sum'])
        base = data[0][0] if data else 0.0
        tax = (data[0][1] if data else 0.0) - base
        return {
            'name': _('Taxes on Sales'),
            'foldability': 'collapsed',
            'style': 'bold',
            'tax_amount': tax,
            'base_amount': base,
        }

    @report_section(id='tax_line', parent='taxes_sales')
    def _section_taxes_sales_lines(self):
        return self._build_tax_lines(is_refund=False)

    @report_section(id='taxes_refunds', name='Taxes on Refunds', sequence=25)
    def _section_taxes_refunds(self):
        domain = self._get_sale_line_domain(is_refund=True)
        data = self.env['pos.order.line']._read_group(domain, [], ['price_subtotal:sum', 'price_subtotal_incl:sum'])
        base = abs(data[0][0]) if data else 0.0
        tax = abs((data[0][1] if data else 0.0) - (data[0][0] if data else 0.0))
        return {
            'name': _('Taxes on Refunds'),
            'foldability': 'collapsed',
            'style': 'bold',
            'tax_amount': tax,
            'base_amount': base,
        }

    @report_section(id='refund_tax_line', parent='taxes_refunds')
    def _section_taxes_refunds_lines(self):
        return self._build_tax_lines(is_refund=True)

    @report_section(id='payments', name='Payments', sequence=30)
    def _section_payments(self):
        order_ids = self._get_filtered_order_ids()
        if not order_ids:
            return {
                'name': _('Payments'),
                'foldability': 'static',
                'style': 'bold',
                'amount_total': 0.0,
            }
        payments = self.env['pos.payment'].search([('pos_order_id', 'in', order_ids)])
        amount = 0.0
        for payment in payments:
            order_currency = payment.pos_order_id.currency_id
            amount += self._convert_to_report_currency(
                payment.amount, order_currency, payment.pos_order_id.company_id, payment.pos_order_id.date_order,
            )
        return {
            'name': _('Payments'),
            'foldability': 'collapsed' if payments else 'static',
            'style': 'bold',
            'amount_total': self._get_currency().round(amount),
        }

    @report_section(id='payment_method', parent='payments')
    def _section_payments_methods(self):
        order_ids = self._get_filtered_order_ids()
        if not order_ids:
            return []
        payments = self.env['pos.payment'].search([
            ('pos_order_id', 'in', order_ids),
        ])
        session_method_amounts = defaultdict(float)
        method_totals = defaultdict(float)
        method_records = {}
        for payment in payments:
            session = payment.session_id
            method = payment.payment_method_id
            order_currency = payment.pos_order_id.currency_id
            converted = self._convert_to_report_currency(
                payment.amount, order_currency, payment.pos_order_id.company_id, payment.pos_order_id.date_order,
            )
            key = (session.id, method.id)
            session_method_amounts[key] += converted
            method_totals[method.id] += converted
            method_records[method.id] = method
        session_lines = [
            {
                'record_id': f'{method_id}_{session_id}',
                'name': f'{method_records[method_id].name} ({self.env["pos.session"].browse(session_id).name})',
                'foldability': 'static',
                'style': 'normal',
                'amount_total': self._get_currency().round(total),
            }
            for (session_id, method_id), total in session_method_amounts.items()
        ]
        total_lines = [
            {
                'record_id': mid,
                'name': method_records[mid].name,
                'foldability': 'static',
                'style': 'bold',
                'amount_total': self._get_currency().round(total),
            }
            for mid, total in method_totals.items()
        ]
        return session_lines + total_lines

    @report_section(id='discounts', name='Discounts', sequence=40)
    def _section_discounts(self):
        ctx = self.env.context
        domain = [('state', 'in', ['paid', 'done', 'invoiced'])]
        if ctx.get('date_from'):
            domain += [('date_order', '>=', ctx['date_from'])]
        if ctx.get('date_to'):
            domain += [('date_order', '<=', ctx['date_to'])]
        if ctx.get('config_ids'):
            domain += [('config_id', 'in', ctx['config_ids'])]
        if ctx.get('session_ids'):
            domain += [('session_id', 'in', ctx['session_ids'])]
        orders = self.env['pos.order'].search(domain)
        disc_orders = orders.filtered(lambda o: o.lines.filtered(lambda line: line.discount > 0))
        disc_amount = 0.0
        for line in orders.lines.filtered(lambda line: line.discount > 0):
            raw_discount = line._get_discount_amount()
            disc_amount += self._convert_to_report_currency(
                raw_discount, line.currency_id, line.company_id, line.order_id.date_order,
            )
        return {
            'name': _('Discounts'),
            'foldability': 'static',
            'style': 'bold',
            'count': len(disc_orders),
            'amount': self._get_currency().round(disc_amount),
        }

    @report_section(id='invoices', name='Invoices', sequence=45)
    def _section_invoices(self):
        order_ids = self._get_filtered_order_ids()
        invoiced = self.env['pos.order'].search([('id', 'in', order_ids), ('account_move', '!=', False)]) if order_ids else self.env['pos.order']
        total_paid = 0.0
        for order in invoiced:
            order_currency = order.currency_id
            total_paid += self._convert_to_report_currency(
                order.amount_paid, order_currency, order.company_id, order.date_order,
            )
        return {
            'name': _('Invoices'),
            'foldability': 'collapsed' if invoiced else 'static',
            'style': 'bold',
            'count': len(invoiced),
            'amount_total': self._get_currency().round(total_paid),
        }

    @report_section(id='invoice_session', parent='invoices')
    def _section_invoices_sessions(self):
        order_ids = self._get_filtered_order_ids()
        if not order_ids:
            return []
        groups = self.env['pos.order']._read_group([('id', 'in', order_ids)], ['session_id'], [])
        result = []
        for (session,) in groups:
            inv_list = session._get_invoice_total_list()
            if not inv_list:
                continue
            session_total = 0.0
            for inv in inv_list:
                session_total += self._convert_to_report_currency(
                    inv.get('total', 0.0), session.currency_id, session.company_id, session.start_at,
                )
            result.append({
                'record_id': session.id,
                'name': session.name,
                'foldability': 'collapsed',
                'style': 'bold',
                'count': len(inv_list),
                'amount_total': self._get_currency().round(session_total),
            })
        return result

    @report_section(id='invoice_line', parent='invoice_session')
    def _section_invoices_lines(self):
        session_id = self.env.context.get('record_id')
        session = self.env['pos.session'].browse(session_id)
        inv_list = session._get_invoice_total_list()
        return [
            {
                'record_id': idx,
                'name': inv.get('name', ''),
                'foldability': 'static',
                'style': 'normal',
                'count': 1,
                'amount_total': self._get_currency().round(self._convert_to_report_currency(
                    inv.get('total', 0.0), session.currency_id, session.company_id, session.start_at,
                )),
                'order_ref': inv.get('order_ref', ''),
            }
            for idx, inv in enumerate(inv_list)
        ]

    @report_section(id='session_control', name='Session Control', sequence=50)
    def _section_session_control(self):
        order_ids = self._get_filtered_order_ids()
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        currency = self._get_currency()
        total_paid = 0.0
        for order in orders:
            order_currency = order.currency_id
            total_paid += self._convert_to_report_currency(
                order.amount_paid, order_currency, order.company_id, order.date_order,
            )
        return {
            'name': _('Session Control'),
            'foldability': 'collapsed',
            'style': 'bold',
            'expected': currency.round(total_paid),
            'counted': currency.round(total_paid),
            'difference': self._compute_cash_rounding(order_ids, currency),
        }

    @report_section(id='sc_method', parent='session_control')
    def _section_session_control_payments(self):
        order_ids = self._get_filtered_order_ids()
        if not order_ids:
            return []
        report_currency = self._get_currency()
        session_groups = self.env['pos.order']._read_group([('id', 'in', order_ids)], ['session_id'], [])
        result = []
        for (session,) in session_groups:
            payments = self.env['pos.payment'].search([
                ('session_id', '=', session.id), ('pos_order_id', 'in', order_ids),
            ])
            method_expected = defaultdict(float)
            for payment in payments:
                order_currency = payment.pos_order_id.currency_id
                converted = self._convert_to_report_currency(
                    payment.amount, order_currency, payment.pos_order_id.company_id, payment.pos_order_id.date_order,
                )
                method_expected[payment.payment_method_id.id] += converted
            for method in payments.mapped('payment_method_id'):
                expected = report_currency.round(method_expected.get(method.id, 0.0))
                counted = difference = 0.0
                has_moves = False
                if method.type == 'cash':
                    opening = self._convert_to_report_currency(
                        session.opening_balance or 0.0, session.currency_id, session.company_id, session.start_at,
                    )
                    closing = self._convert_to_report_currency(
                        session.closing_balance, session.currency_id, session.company_id, session.start_at,
                    )
                    difference = report_currency.round(closing - (expected + opening))
                    has_moves = True
                else:
                    acct_pays = self.env['account.payment'].search([
                        ('pos_session_id', '=', session.id), ('pos_payment_method_id', '=', method.id),
                    ])
                    if acct_pays:
                        counted = report_currency.round(sum(
                            self._convert_to_report_currency(
                                p.amount_signed, p.currency_id, p.company_id, p.date,
                            ) for p in acct_pays
                        ))
                        difference = report_currency.round(counted - expected)
                        has_moves = abs(difference) > 0.0
                    else:
                        move = self.env['account.move'].search(
                            [('ref', '=', _("Closing difference in %s (%s)", method.name, session.name))], limit=1)
                        if move:
                            is_loss = any(line.account_id == method.journal_id.loss_account_id for line in move.line_ids)
                            move_amount = self._convert_to_report_currency(
                                move.amount_total, move.currency_id, move.company_id, move.date,
                            )
                            difference = report_currency.round(-move_amount if is_loss else move_amount)
                            counted = report_currency.round(expected + difference)
                            has_moves = True
                result.append({
                    'record_id': f'{session.id}_{method.id}',
                    'name': f'{method.name} ({session.name})',
                    'foldability': 'collapsed' if has_moves else 'static',
                    'style': 'normal',
                    'expected': expected,
                    'counted': counted,
                    'difference': difference,
                    '_session_id': session.id,
                    '_method_id': method.id,
                })
        return result

    @report_section(id='sc_move', parent='sc_method')
    def _section_session_control_cash_moves(self):
        record_id = self.env.context.get('record_id')
        session_id, method_id = (int(x) for x in record_id.split('_', 1))
        session = self.env['pos.session'].browse(session_id)
        method = self.env['pos.payment.method'].browse(method_id)
        if method.type == 'cash':
            return self._build_cash_moves_cash(session, method)
        return self._build_cash_moves_non_cash(session, method)

    @report_section(id='opening_notes', name='Opening Notes', sequence=60)
    def _section_opening_notes(self):
        order_ids = self._get_filtered_order_ids()
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        sessions = orders.mapped('session_id')
        note = sessions[:1].opening_notes if len(sessions) == 1 and sessions[:1].opening_notes else ''
        return {
            'name': _('Opening Notes'),
            'foldability': 'static',
            'style': 'normal',
            'note': note,
        }

    @report_section(id='closing_notes', name='Closing Notes', sequence=70)
    def _section_closing_notes(self):
        order_ids = self._get_filtered_order_ids()
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        sessions = orders.mapped('session_id')
        note = sessions[:1].closing_notes if len(sessions) == 1 and sessions[:1].closing_notes else ''
        return {
            'name': _('Closing Notes'),
            'foldability': 'static',
            'style': 'normal',
            'note': note,
        }

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
            raw_amount = self._get_product_total_amount(line)
            d['amount_total'] += self._convert_to_report_currency(
                raw_amount, line.currency_id, line.company_id, line.order_id.date_order,
            )
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
                'foldability': 'static',
                'style': 'normal',
                'qty': d['qty'],
                'amount_total': d['amount_total'],
                'discount': d['discount'],
                'uom': d['uom'],
                'barcode': d['barcode'],
                'combo_label': d['combo_label'],
            })
        return sorted(result, key=lambda line: line['name'])

    def _build_tax_lines(self, is_refund):
        domain = self._get_sale_line_domain(is_refund=is_refund)
        lines = self.env['pos.order.line'].search(domain)
        currency = self._get_currency()
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
                'name': t['name'],
                'foldability': 'static',
                'style': 'normal',
                'tax_amount': t['tax_amount'],
                'base_amount': t['base_amount'],
            }
            for tid, t in taxes.items()
        ]

    def _build_cash_moves_cash(self, session, method):
        report_currency = self._get_currency()
        cash_moves = self.env['account.bank.statement.line'].search([('pos_session_id', '=', session.id)])
        result = []
        if session.opening_balance > 0:
            result.append({
                'record_id': 'opening',
                'name': _('Cash Opening'),
                'foldability': 'static',
                'style': 'normal',
                'amount_total': report_currency.round(self._convert_to_report_currency(
                    session.cash_register_balance_start, session.currency_id, session.company_id, session.start_at,
                )),
            })
        counter = 0
        for move in cash_moves:
            if move.move_id.journal_id.id != method.journal_id.id:
                continue
            counter += 1
            name = move.payment_ref or (f'Cash in {counter}' if move.amount > 0 else f'Cash out {counter}')
            result.append({
                'record_id': move.id,
                'name': name,
                'foldability': 'static',
                'style': 'normal',
                'amount_total': report_currency.round(self._convert_to_report_currency(
                    move.amount, move.currency_id, move.company_id, move.date,
                )),
            })
        return result

    def _build_cash_moves_non_cash(self, session, method):
        report_currency = self._get_currency()
        acct_pays = self.env['account.payment'].search([
            ('pos_session_id', '=', session.id), ('pos_payment_method_id', '=', method.id),
        ])
        result = []
        if acct_pays:
            counted = report_currency.round(sum(
                self._convert_to_report_currency(
                    p.amount_signed, p.currency_id, p.company_id, p.date,
                ) for p in acct_pays
            ))
            pos_payments = self.env['pos.payment'].search([
                ('session_id', '=', session.id), ('payment_method_id', '=', method.id),
            ])
            expected = 0.0
            for p in pos_payments:
                order_currency = p.pos_order_id.currency_id
                expected += self._convert_to_report_currency(
                    p.amount, order_currency, p.pos_order_id.company_id, p.pos_order_id.date_order,
                )
            diff = report_currency.round(counted - expected)
            if not report_currency.is_zero(diff):
                result.append({
                    'record_id': 'diff',
                    'name': _('Difference observed during the counting (%s)', 'Profit' if diff > 0 else 'Loss'),
                    'foldability': 'static',
                    'style': 'normal',
                    'amount_total': diff,
                })
        else:
            move = self.env['account.move'].search(
                [('ref', '=', _("Closing difference in %s (%s)", method.name, session.name))], limit=1)
            if move:
                is_loss = any(line.account_id == method.journal_id.loss_account_id for line in move.line_ids)
                move_amount = self._convert_to_report_currency(
                    move.amount_total, move.currency_id, move.company_id, move.date,
                )
                result.append({
                    'record_id': move.id,
                    'name': _('Difference observed during the counting (%s)', 'Loss' if is_loss else 'Profit'),
                    'foldability': 'static',
                    'style': 'normal',
                    'amount_total': report_currency.round(-move_amount if is_loss else move_amount),
                })
        return result

    def _get_sale_line_domain(self, is_refund=False):
        domain = Domain([
            ('order_id.state', 'in', ['paid', 'done']),
            ('order_id.is_refund', '=', is_refund),
        ])

        if session_ids := self.env.context.get('session_ids'):
            domain &= Domain([('order_id.session_id', 'in', session_ids)])
        else:
            if date_from := self.env.context.get('date_from'):
                domain &= Domain([('order_id.date_order', '>=', date_from)])

            if date_to := self.env.context.get('date_to'):
                domain &= Domain([('order_id.date_order', '<=', date_to)])

            if config_ids := self.env.context.get('config_ids'):
                domain &= Domain([('order_id.config_id', 'in', config_ids)])

        return domain

    def _get_order_domain(self):
        """Domain selecting the orders in scope."""
        domain = Domain([('state', 'in', ['paid', 'done'])])
        if date_from := self.env.context.get('date_from'):
            domain &= Domain([('date_order', '>=', date_from)])

        if date_to := self.env.context.get('date_to'):
            domain &= Domain([('date_order', '<=', date_to)])

        if config_ids := self.env.context.get('config_ids'):
            domain &= Domain([('config_id', 'in', config_ids)])

        if session_ids := self.env.context.get('session_ids'):
            domain &= Domain([('session_id', 'in', session_ids)])
        return domain

    def _get_filtered_order_ids(self):
        return self.env['pos.order'].search(self._get_order_domain()).ids

    def _is_discount_product(self, line):
        return line.order_id.config_id.module_pos_discount and line.product_id.id == line.order_id.config_id.discount_product_id.id

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

    def _convert_to_report_currency(self, amount, from_currency, company=False, date=False):
        """Convert amount from from_currency to the report currency."""
        to_currency = self._get_currency()

        if isinstance(from_currency, int):
            from_currency = self.env['res.currency'].browse(from_currency)
        if isinstance(company, int):
            company = self.env['res.company'].browse(company)

        if not from_currency or from_currency == to_currency:
            return amount

        return from_currency._convert(amount, to_currency, company, date)
