from odoo import fields, models
from odoo.tools import float_round
from odoo.tools.sql import SQL


# Context keys used to narrow the ledgers before the window functions run. Only filters that can't change the
# running balance of the remaining lines can be pushed down: the ledger columns (product, warehouse) and a lower
# bound on the date (the balances are tracked backward from the current stock, so older lines are never needed
# to value the newer ones).
CONTEXT_PRODUCT_IDS = 'stock_card_product_ids'
CONTEXT_WAREHOUSE_IDS = 'stock_card_warehouse_ids'
CONTEXT_DATE_FROM = 'stock_card_date_from'


class StockCardReport(models.Model):
    _name = 'stock.card.report'
    _description = 'Stock Card Report'
    _auto = False

    move_line_id = fields.Many2one('stock.move.line', string='Stock Move Line', readonly=True)
    move_id = fields.Many2one('stock.move', string='Stock Move', readonly=True)
    next_line_id = fields.Many2one('stock.card.report', string='Next Line', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    date = fields.Datetime(string='Date', readonly=True)
    warehouse_id = fields.Many2one('stock.warehouse', string='Warehouse', readonly=True)
    location_id = fields.Many2one('stock.location', string='From', readonly=True)
    location_dest_id = fields.Many2one('stock.location', string='To', readonly=True)
    lot_id = fields.Many2one('stock.lot', string='Lot/Serial Number', readonly=True)
    uom_id = fields.Many2one('uom.uom', string='Unit', readonly=True)
    operation_type = fields.Selection([
        ('incoming', 'Receipt'),
        ('outgoing', 'Delivery'),
        ('internal', 'Internal Transfer'),
        ('mrp_operation', 'Manufacturing'),
        ('repair_operation', 'Repair'),
        ('dropship', 'Dropship')], string='Operation Category', readonly=True)
    reference = fields.Char(string='Reference', readonly=True)
    origin = fields.Char(string='Source', readonly=True)
    default_code = fields.Char(string='Internal Reference', readonly=True)
    removal_date = fields.Datetime(string='Removal Date', compute='_compute_removal_date', help="Used for FEFO removal strategy")
    owner_id = fields.Many2one('res.partner', string='From Owner', readonly=True)

    # Quantity fields
    quantity = fields.Float(string='Demand', readonly=True)
    qty_start = fields.Float(string='Start Quantity', readonly=True)
    qty_in = fields.Float(string='In Quantity', readonly=True)
    qty_out = fields.Float(string='Out Quantity', readonly=True)
    qty_balance = fields.Float(string='Balance Quantity', readonly=True)

    # Valuation fields
    currency_id = fields.Many2one('res.currency', related='move_id.company_currency_id', readonly=True)
    unit_price = fields.Monetary(string='Unit Price', readonly=True, groups='account.group_account_manager')
    # Signed value of the move line (+ for incoming, - for outgoing, 0 for neutral), taken from `stock.move.value`
    value_move = fields.Monetary(string='Value Movement', readonly=True, groups='account.group_account_manager')
    unit_cost = fields.Monetary(string='Unit Cost', compute='_compute_valuation_fields', groups='account.group_account_manager')
    value_start = fields.Monetary(string='Start Value', compute='_compute_valuation_fields', groups='account.group_account_manager')
    value_in = fields.Monetary(string='In Value', compute='_compute_valuation_fields', groups='account.group_account_manager')
    value_out = fields.Monetary(string='Out Value', compute='_compute_valuation_fields', groups='account.group_account_manager')
    value_ending = fields.Monetary(string='Ending Value', compute='_compute_valuation_fields', groups='account.group_account_manager')

    @property
    def _table_sql(self):
        return SQL("(%s)", self._stock_card_report_query())

    def _stock_card_report_query(self) -> SQL:
        company_ids = self.env.companies.ids
        context = self.env.context
        product_ids = context.get(CONTEXT_PRODUCT_IDS)
        warehouse_ids = context.get(CONTEXT_WAREHOUSE_IDS)
        date_from = context.get(CONTEXT_DATE_FROM)

        move_line_filters = SQL()
        stock_filters = SQL()
        if product_ids:
            move_line_filters = SQL("%s AND sml.product_id IN %s", move_line_filters, tuple(product_ids))
            stock_filters = SQL("%s AND sq.product_id IN %s", stock_filters, tuple(product_ids))
        if warehouse_ids:
            move_line_filters = SQL(
                "%s AND COALESCE(sm.warehouse_id, spt.warehouse_id, sl.warehouse_id, sl_dest.warehouse_id) IN %s",
                move_line_filters, tuple(warehouse_ids),
            )
            stock_filters = SQL("%s AND sloc.warehouse_id IN %s", stock_filters, tuple(warehouse_ids))
        if date_from:
            move_line_filters = SQL("%s AND sml.date >= %s", move_line_filters, date_from)

        return SQL("""
                WITH stock_movements AS (
                    SELECT
                        sml.id AS id,
                        sml.id AS move_line_id,
                        sm.id AS move_id,
                        sml.date,
                        spt.code AS operation_type,
                        sm.reference,
                        sm.origin,
                        -- Resolve the warehouse from the most specific source available.
                        -- Priority: stock move -> operation type -> source location -> destination location.
                        COALESCE(
                            sm.warehouse_id,
                            spt.warehouse_id,
                            sl.warehouse_id,
                            sl_dest.warehouse_id
                        ) AS warehouse_id,
                        pp.default_code,
                        sml.product_id,
                        sml.company_id,
                        sml.owner_id,
                        sml.lot_id,
                        sl.id AS location_id,
                        sl_dest.id AS location_dest_id,
                        sml.quantity,
                        sml.uom_id,
                        -- A movement is incoming (+1), outgoing (-1), or neutral (0) depending on whether it crosses the internal stock boundary.
                        ((sl_dest.usage = 'internal')::int - (sl.usage = 'internal')::int) AS sign,
                        -- Apply the sign to the quantity so incoming and outgoing movements can be combined into a single running balance.
                        sml.quantity * ((sl_dest.usage = 'internal')::int - (sl.usage = 'internal')::int) AS signed_qty,
                        sm.value,
                        sm.quantity AS move_quantity,
                        pt.lot_valuated,
                        sm.is_scrap
                    FROM stock_move_line sml
                    JOIN stock_move sm
                        ON sm.id = sml.move_id
                       AND sm.state = 'done'
                    JOIN product_product pp
                        ON pp.id = sml.product_id
                    JOIN product_template pt
                        ON pt.id = pp.product_tmpl_id
                    LEFT JOIN stock_picking_type spt
                        ON spt.id = sm.picking_type_id
                    JOIN stock_location sl
                        ON sl.id = sml.location_id
                    JOIN stock_location sl_dest
                        ON sl_dest.id = sml.location_dest_id
                    WHERE sml.company_id IN %s %s
                ),
                current_stock AS (
                    -- Current quantity of every ledger, the ending balance of its newest movement.
                    SELECT
                        sq.company_id,
                        sq.product_id,
                        sq.owner_id,
                        sloc.warehouse_id,
                        CASE WHEN pt.lot_valuated THEN sq.lot_id ELSE NULL END AS lot_id,
                        SUM(sq.quantity) AS quantity
                    FROM stock_quant sq
                    JOIN stock_location sloc
                        ON sloc.id = sq.location_id
                       AND sloc.usage = 'internal'
                    JOIN product_product pp
                        ON pp.id = sq.product_id
                    JOIN product_template pt
                        ON pt.id = pp.product_tmpl_id
                    WHERE sq.company_id IN %s %s
                    GROUP BY 1, 2, 3, 4, 5
                ),
                stock_running_balance AS (
                    SELECT
                        sm.*,
                        CASE
                            WHEN sm.sign = 1 THEN sm.quantity
                            ELSE 0.0
                        END AS qty_in,
                        CASE
                            WHEN sm.sign = -1 THEN sm.quantity
                            ELSE 0.0
                        END AS qty_out,
                        CASE
                            WHEN sm.sign = 1 AND sm.move_quantity != 0 THEN sm.value / sm.move_quantity
                            ELSE 0.0
                        END AS unit_price,
                        -- Value of this move line, split from the move value in proportion to its quantity and signed
                        -- like the quantity, so that the ending value can be walked backward from the current valuation.
                        CASE
                            WHEN sm.move_quantity != 0
                            THEN sm.sign * ABS(COALESCE(sm.value, 0.0)) * sm.quantity / sm.move_quantity
                            ELSE 0.0
                        END AS value_move,
                        -- Reverse tracking: the ending balance of the newest movement is the current stock, and the
                        -- ending balance of every older movement is the current stock minus the movements after it.
                        -- LAG over the descending order is the next movement in time, whose starting balance is
                        -- the ending balance of the current one.
                        COALESCE(cs.quantity, 0.0)
                            - COALESCE(SUM(sm.signed_qty) OVER reversed_stock_movement, 0.0) AS qty_balance,
                        LAG(sm.id) OVER reversed_stock_movement_order AS next_line_id
                    FROM stock_movements sm
                    LEFT JOIN current_stock cs
                        ON cs.company_id = sm.company_id
                       AND cs.product_id = sm.product_id
                       AND cs.owner_id IS NOT DISTINCT FROM sm.owner_id
                       AND cs.warehouse_id IS NOT DISTINCT FROM sm.warehouse_id
                       AND cs.lot_id IS NOT DISTINCT FROM (CASE WHEN sm.lot_valuated THEN sm.lot_id ELSE NULL END)
                    WINDOW
                        -- Keep independent ledgers for each company, product, owner and warehouse;
                        -- include the lot only for lot-valuated products.
                        reversed_stock_movement_order AS (
                            PARTITION BY
                                sm.company_id,
                                sm.product_id,
                                sm.owner_id,
                                sm.warehouse_id,
                                CASE WHEN sm.lot_valuated THEN sm.lot_id ELSE NULL END
                            ORDER BY sm.date DESC, sm.id DESC
                        ),
                        -- Only the movements strictly after the current one.
                        reversed_stock_movement AS (
                            reversed_stock_movement_order
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                        )
                )
                SELECT
                    srb.*,
                    -- The running balance includes the current movement, so subtract
                    -- it to obtain the starting stock balance for the current movement.
                    COALESCE(srb.qty_balance - srb.signed_qty, 0.0) AS qty_start
                FROM stock_running_balance srb
            """,
            tuple(company_ids) if company_ids else (None,),
            move_line_filters,
            tuple(company_ids) if company_ids else (None,),
            stock_filters,
        )

    def _compute_removal_date(self):
        is_product_expiry_installed = 'product_expiry' in self.env['ir.module.module']._installed()
        if is_product_expiry_installed:
            for line in self:
                line.removal_date = line.move_line_id._get_removal_date()
        else:
            self.removal_date = False

    def _compute_valuation_fields(self):
        """ Compute valuation amounts for each Stock Card Report line.

        The values are computed backward, from the present to the past: the lines are processed from
        the latest one to the oldest one, so that the next line of a line (`next_line_id`) is always
        valued before it.

        1. The latest line of a ledger (the one without `next_line_id`) ends at the current valuation
           of the ledger.
        2. The ending value of any other line is the starting value of its next line.
        3. The starting value of a line is its ending value minus its own value.
        """
        values_by_line_id = {}
        # Unrounded starting values, so that rounding errors don't accumulate from one line to the other.
        starting_value_by_line_id = {}
        for line in self._with_next_lines().sorted(lambda line: (line.date, line.id), reverse=True):
            next_line = line.next_line_id
            if next_line:
                ending_value = starting_value_by_line_id[next_line.id]
            else:
                ending_value = line._get_current_value()
            values_by_line_id[line.id], starting_value_by_line_id[line.id] = line._get_valuation_values(ending_value)

        for line in self:
            line.update(values_by_line_id[line.id])

    def _with_next_lines(self):
        """ The lines of `self` with all the lines more recent than them in their ledgers.

        The lines are valued backward from the latest line of their ledger, which may not be part of `self`
        (e.g. the report is filtered on a date range). All the lines of the products of `self` since its
        oldest line are fetched at once: the next line of any of them is more recent, so it is fetched too.
        """
        line_ids = set(self.ids)
        if all(line.next_line_id.id in line_ids for line in self if line.next_line_id):
            return self
        domain = [
            ('product_id', 'in', self.product_id.ids),
            ('date', '>=', min(self.mapped('date'))),
        ]
        return self | self.sudo().search(domain).with_env(self.env)

    def _is_consignment(self):
        """ Consignment does not affect the valuation. """
        self.ensure_one()
        return self.owner_id and self.owner_id != self.company_id.partner_id

    @staticmethod
    def _is_transit_line(line):
        return any(
            location.usage == 'transit' and location.company_id
            for location in (line.location_id, line.location_dest_id)
        )

    def _get_current_value(self):
        """ Current valuation of the ledger of the line, i.e. the ending value of its latest line.

        Inter-warehouse transit moves are not valued, so the value of a warehouse is the value of the
        other moves of its ledger, and not its share of the company valuation (`total_value`).
        """
        self.ensure_one()
        if self._is_consignment():
            return 0.0
        company = self.company_id
        product = self.product_id.with_company(company)
        if product.lot_valuated and product.cost_method != 'standard':
            # The value of the outgoing moves of a lot is not stored by lot, take the current value of the lot.
            context = {'allowed_company_ids': company.ids, 'warehouse_id': self.warehouse_id.id or False}
            lot = self.lot_id.with_company(company).with_context(**context)
            return lot.total_value if lot else 0.0

        qty_in, qty_out, value_move = self._get_ledger_valued_totals()
        if product.cost_method == 'standard':
            # Standard cost products are valued at the standard price, whatever the price of the move was.
            return product.standard_price * (qty_in - qty_out)
        return value_move

    def _get_ledger_valued_totals(self):
        """ Totals of the whole history of the ledger of the line, inter-warehouse transit moves excluded.

        :return: a tuple (quantity in, quantity out, value of the moves)
        """
        self.ensure_one()
        domain = [
            ('company_id', '=', self.company_id.id),
            ('product_id', '=', self.product_id.id),
            ('owner_id', '=', self.owner_id.id or False),
            ('warehouse_id', '=', self.warehouse_id.id or False),
            '!', '&', ('location_id.usage', '=', 'transit'), ('location_id.company_id', '!=', False),
            '!', '&', ('location_dest_id.usage', '=', 'transit'), ('location_dest_id.company_id', '!=', False),
        ]
        if self.product_id.lot_valuated:
            domain.append(('lot_id', '=', self.lot_id.id or False))
        # The lines before the date from are part of the history of the ledger.
        report = self.sudo().with_context(**{CONTEXT_DATE_FROM: False})
        [(qty_in, qty_out, value_move)] = report._read_group(
            domain, aggregates=['qty_in:sum', 'qty_out:sum', 'value_move:sum'],
        )
        return qty_in or 0.0, qty_out or 0.0, value_move or 0.0

    def _get_valuation_values(self, ending_value):
        """ Valuation fields of the line, given its ending value.

        :return: a tuple (valuation fields, unrounded starting value)
        """
        self.ensure_one()
        product = self.product_id.with_company(self.company_id)
        standard_price = product.standard_price
        if self._is_consignment():
            return {
                'value_start': 0.0,
                'value_in': 0.0,
                'value_out': 0.0,
                'value_ending': 0.0,
                'unit_cost': float_round(standard_price, precision_digits=2),
            }, 0.0

        cost_method = product.cost_method
        if self._is_transit_line(self):
            # Inter-warehouse transit moves are not valued, as in stock_account: the stock in transit stays
            # valued in the company, so they don't change the value of the ledger.
            delta = 0.0
        elif cost_method == 'standard':
            delta = standard_price * (self.qty_in - self.qty_out)
        elif self.qty_out and product.lot_valuated and self.lot_id:
            # The value of an outgoing move is computed lot by lot, but only its total is stored on the move:
            # splitting it in proportion to the quantity is wrong when the move takes lots of different costs.
            # The line is valued at the cost of its lot instead.
            if cost_method == 'average' and self.qty_balance:
                # The average cost of the lot is not changed by an outgoing move, it is the one after the line.
                lot_cost = ending_value / self.qty_balance
            else:
                lot_cost = self.lot_id.with_company(self.company_id).standard_price
            delta = -lot_cost * self.qty_out
        else:
            delta = self.value_move
        starting_value = ending_value - delta

        line_unit_cost = abs(delta) / self.quantity if delta and self.quantity else 0.0
        running_unit_cost = ending_value / self.qty_balance if self.qty_balance else 0.0
        if cost_method == 'standard':
            unit_cost = standard_price
        elif cost_method == 'average':
            unit_cost = running_unit_cost or line_unit_cost or standard_price
        else:
            unit_cost = line_unit_cost or standard_price

        return {
            'value_start': float_round(starting_value, precision_digits=2),
            'value_in': float_round(delta, precision_digits=2) if self.qty_in else 0.0,
            'value_out': float_round(-delta, precision_digits=2) if self.qty_out else 0.0,
            'value_ending': float_round(ending_value, precision_digits=2),
            'unit_cost': float_round(unit_cost, precision_digits=2),
        }, starting_value
