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
        """Report display currency, cached for the current transaction."""
        config_ids = tuple(sorted(self.env.context.get('config_ids') or ()))
        session_ids = tuple(sorted(self.env.context.get('session_ids') or ()))
        key = ('pos_sales_detail_currency', config_ids, session_ids, self.env.company.id)

        cache = self.env.cr.cache
        if key not in cache:
            if config_ids:
                currencies = self.env['pos.config'].browse(config_ids).mapped('currency_id')
            elif session_ids:
                currencies = self.env['pos.session'].browse(session_ids).mapped('config_id.currency_id')
            else:
                currencies = self.env['pos.config'].search([]).mapped('currency_id')

            currency = (
                currencies[0]
                if currencies and len(set(currencies.ids)) == 1
                else self.env.company.currency_id
            )
            cache[key] = currency.id

        return self.env['res.currency'].browse(cache[key])

    def _get_sale_line_totals(self, is_refund=False, group_fields=[], extra_domain=None):
        """Get sale line totals grouped by the given field."""
        domain = self._get_sale_line_domain(is_refund=is_refund)
        if extra_domain:
            domain &= Domain(extra_domain)
        query = self.env['pos.order.line']._search(domain)

        line_table = query.table
        order_table = line_table._join('order_id')
        config_table = order_table._join('config_id')

        if 'discount_product_id' in self.env['pos.config']._fields:
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
            *(line_table[field] for field in group_fields),
        ]

        query.groupby = SQL(", ").join(group_by)

        select = [
            SQL("COALESCE(SUM(ABS(%s)), 0.0)", line_table['qty']),
            SQL(
                "COALESCE(SUM(COALESCE(%s, 0.0) * COALESCE(%s, 0.0) "
                "* (100.0 - COALESCE(%s, 0.0)) / 100.0), 0.0)",
                line_table['price_unit'], line_table['qty'], line_table['discount'],
            ),
        ]

        rows = self.env.execute_query(query.select(*select, *group_by))

        totals = defaultdict(lambda: [0.0, 0.0])
        for qty, amount, curr_id, comp_id, date_order, *group in rows:
            total = totals[group[0] if len(group) == 1 else tuple(group) if group else 'default']
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
        product_totals = self._get_sale_line_totals(group_fields=['product_id'])
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
        return self._build_product_lines(is_refund=False)

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
        product_totals = self._get_sale_line_totals(is_refund=True, group_fields=['product_id'])
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
        return self._build_product_lines(is_refund=True)

    def _build_product_lines(self, is_refund):
        category_id = self.env.context.get('record_id')
        category_domain = [
            ('product_id.product_tmpl_id.pos_categ_ids', '=', False)
            if not category_id
            else ('product_id.product_tmpl_id.pos_categ_ids', 'in', [category_id]),
        ]
        totals = self._get_sale_line_totals(
            is_refund=is_refund,
            group_fields=['product_id', 'price_unit', 'discount'],
            extra_domain=category_domain,
        )

        products = self.env['product.product'].browse({key[0] for key in totals})
        combo_lines = self.env['pos.order.line'].search(
            self._get_sale_line_domain(is_refund=is_refund)
            & Domain(category_domain)
            & Domain([('combo_line_ids', '!=', False)]),
        )

        combo_labels = {
            (line.product_id.id, line.price_unit, line.discount):
                ' (' + ', '.join(line.combo_line_ids.product_id.mapped('name')) + ')'
            for line in combo_lines
        }

        result = []
        for (product_id, price, discount), (qty, amount) in totals.items():
            product = products.browse(product_id)
            result.append({
                'record_id': f'{product_id}_{price}_{discount}'.replace('.', '_'),
                'name': product.display_name,
                'foldability': 'static',
                'style': 'normal',
                'qty': qty,
                'amount_total': self._get_currency().round(amount),
                'discount': discount,
                'uom': product.uom_id.name,
                'barcode': product.barcode or False,
                'combo_label': combo_labels.get((product_id, price, discount), ''),
            })

        return sorted(result, key=lambda line: line['name'])

    def _get_tax_totals(self, is_refund=False):
        """Aggregate tax base and tax amount from POS order lines."""
        query = self.env['pos.order.line']._search(self._get_sale_line_domain(is_refund=is_refund))

        line_table = query.table
        order_table = line_table._join('order_id')
        config_table = order_table._join('config_id')

        group_by = [
            config_table['currency_id'],
            line_table['company_id'],
            SQL("CAST(%s AS date)", order_table['date_order']),
        ]
        query.groupby = SQL(", ").join(group_by)

        select = [
            SQL("COALESCE(SUM(%s), 0.0)", line_table['price_subtotal']),
            SQL("COALESCE(SUM(%s), 0.0)", line_table['price_subtotal_incl']),
        ]

        rows = self.env.execute_query(query.select(*select, *group_by))

        base = 0.0
        tax = 0.0
        for subtotal, subtotal_incl, currency_id, company_id, date_order in rows:
            base += self._convert_to_report_currency(subtotal, currency_id, company_id, date_order)
            tax += self._convert_to_report_currency(subtotal_incl - subtotal, currency_id, company_id, date_order)

        if is_refund:
            base = abs(base)
            tax = abs(tax)

        return base, tax

    @report_section(id='taxes_sales', name='Taxes on Sales', sequence=20)
    def _section_taxes_sales(self):
        base, tax = self._get_tax_totals()
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
        base, tax = self._get_tax_totals(is_refund=True)
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

    @report_section(id='payments', name='Payments', sequence=30)
    def _section_payments(self):
        order_ids = self.env['pos.order'].search(self._get_order_domain()).ids
        if not order_ids:
            return {
                'name': _('Payments'),
                'foldability': 'static',
                'style': 'bold',
                'amount_total': 0.0,
            }

        payment_groups = self.env['pos.payment']._read_group(
            [('pos_order_id', 'in', order_ids)],
            ['pos_order_id.currency_id', 'pos_order_id.company_id', 'pos_order_id.date_order:day'],
            ['amount:sum'],
        )

        total = 0.0
        for currency, company, date_order, amount in payment_groups:
            total += self._convert_to_report_currency(amount, currency, company, date_order)

        return {
            'name': _('Payments'),
            'foldability': 'collapsed' if payment_groups else 'static',
            'style': 'bold',
            'amount_total': self._get_currency().round(total),
        }

    @report_section(id='payment_method', parent='payments')
    def _section_payments_methods(self):
        order_ids = self.env['pos.order'].search(self._get_order_domain()).ids
        if not order_ids:
            return []

        groups = self.env['pos.payment']._read_group(
            [('pos_order_id', 'in', order_ids)],
            [
                'session_id',
                'payment_method_id',
                'pos_order_id.currency_id',
                'pos_order_id.company_id',
                'pos_order_id.date_order:day',
            ],
            ['amount:sum'],
        )

        session_totals = defaultdict(float)
        method_totals = defaultdict(float)
        sessions = {}
        methods = {}

        for session, method, currency, company, date_order, amount in groups:
            amount = self._convert_to_report_currency(amount, currency, company, date_order)

            session_totals[session.id, method.id] += amount
            method_totals[method.id] += amount

            sessions[session.id] = session
            methods[method.id] = method

        session_lines = [
            {
                'record_id': f'{method_id}_{session_id}',
                'name': f'{methods[method_id].name} ({sessions[session_id].name})',
                'foldability': 'static',
                'style': 'normal',
                'amount_total': self._get_currency().round(amount),
            }
            for (session_id, method_id), amount in session_totals.items()
        ]

        method_lines = [
            {
                'record_id': method_id,
                'name': methods[method_id].name,
                'foldability': 'static',
                'style': 'bold',
                'amount_total': self._get_currency().round(amount),
            }
            for method_id, amount in method_totals.items()
        ]

        return session_lines + method_lines

    @report_section(id='discounts', name='Discounts', sequence=40)
    def _section_discounts(self):
        domain = self._get_sale_line_domain() & Domain([('discount', '>', 0)])
        lines = self.env['pos.order.line'].search(domain)

        discount_amount = sum(
            self._convert_to_report_currency(
                line._get_discount_amount_for_report(),
                line.currency_id,
                line.company_id,
                line.order_id.date_order,
            )
            for line in lines
        )

        return {
            'name': _('Discounts'),
            'foldability': 'static',
            'style': 'bold',
            'count': len(lines),
            'amount': self._get_currency().round(discount_amount),
        }

    @report_section(id='invoices', name='Invoices', sequence=45)
    def _section_invoices(self):
        domain = self._get_order_domain() & Domain([('account_move', '!=', False)])
        orders = self.env['pos.order'].search_fetch(
            domain, ['is_singly_invoiced', 'is_globally_invoiced', 'account_move', 'session_id', 'company_id', 'date_order'],
        ).filtered(lambda order: order.is_singly_invoiced or order.is_globally_invoiced)

        if not orders:
            return {
                'name': _('Invoices'),
                'foldability': 'static',
                'style': 'bold',
                'count': 0,
                'amount_total': 0.0,
            }

        moves = orders.mapped('account_move')

        total = 0.0
        for move in moves:
            company = move.company_id
            total += self._convert_to_report_currency(move.amount_total_signed, company.currency_id, company, move.date)

        return {
            'name': _('Invoices'),
            'foldability': 'collapsed' if moves else 'static',
            'style': 'bold',
            'count': len(moves),
            'amount_total': self._get_currency().round(total),
        }

    @report_section(id='invoice_session', parent='invoices')
    def _section_invoices_sessions(self):
        domain = self._get_order_domain() & Domain([('account_move', '!=', False)])
        orders = self.env['pos.order'].search_fetch(
            domain, ['is_singly_invoiced', 'is_globally_invoiced', 'account_move', 'session_id'],
        ).filtered(lambda order: order.is_singly_invoiced or order.is_globally_invoiced)

        if not orders:
            return []

        sessions = defaultdict(set)
        for order in orders:
            sessions[order.session_id].add(order.account_move)

        return [
            {
                'record_id': session.id,
                'name': session.name,
                'foldability': 'collapsed',
                'style': 'bold',
                'count': len(moves),
                'amount_total': self._get_currency().round(sum(
                    self._convert_to_report_currency(
                        move.amount_total_signed,
                        move.company_id.currency_id,
                        move.company_id,
                        move.date,
                    )
                    for move in moves
                )),
            }
            for session, moves in sessions.items()
        ]

    @report_section(id='invoice_line', parent='invoice_session')
    def _section_invoices_lines(self):
        session_id = self.env.context.get('record_id')
        domain = self._get_order_domain() & Domain([('account_move', '!=', False), ('session_id', '=', session_id)])
        orders = self.env['pos.order'].search_fetch(
            domain, ['is_singly_invoiced', 'is_globally_invoiced', 'pos_reference', 'account_move'],
        ).filtered(lambda order: order.is_singly_invoiced or order.is_globally_invoiced)

        if not orders:
            return []

        moves = defaultdict(list)
        for order in orders:
            moves[order.account_move].append(order)

        return [
            {
                'record_id': move.id,
                'name': move.name,
                'foldability': 'static',
                'style': 'normal',
                'count': 1,
                'amount_total': self._get_currency().round(
                    self._convert_to_report_currency(
                        move.amount_total_signed,
                        move.company_id.currency_id,
                        move.company_id,
                        move.date,
                    ),
                ),
                'order_ref': ', '.join(order.pos_reference for order in move_orders if order.pos_reference),
            }
            for move, move_orders in moves.items()
        ]

    @report_section(id='session_control', name='Session Control', sequence=50)
    def _section_session_control(self):
        order_ids = self.env['pos.order'].search(self._get_order_domain()).ids
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
        order_ids = self.env['pos.order'].search(self._get_order_domain()).ids
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
        order_ids = self.env['pos.order'].search(self._get_order_domain()).ids
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
        order_ids = self.env['pos.order'].search(self._get_order_domain()).ids
        orders = self.env['pos.order'].browse(order_ids) if order_ids else self.env['pos.order']
        sessions = orders.mapped('session_id')
        note = sessions[:1].closing_notes if len(sessions) == 1 and sessions[:1].closing_notes else ''
        return {
            'name': _('Closing Notes'),
            'foldability': 'static',
            'style': 'normal',
            'note': note,
        }

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

    def _get_sale_line_domain(self, is_refund=None):
        domain = Domain([('order_id.state', 'in', ['paid', 'done'])])

        if is_refund is not None:
            domain &= Domain([('order_id.is_refund', '=', is_refund)])

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
