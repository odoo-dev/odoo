# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import float_is_zero, float_repr, float_round, float_compare
from odoo.exceptions import ValidationError
from collections import defaultdict
from datetime import datetime


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    cost_method = fields.Selection(
        string="Cost Method",
        selection=[
            ('standard', "Standard Price"),
            ('fifo', "First In First Out (FIFO)"),
            ('average', "Average Cost (AVCO)"),
        ],
        compute='_compute_cost_method',
    )
    valuation = fields.Selection(
        string="Valuation",
        selection=[
            ('periodic', 'Periodic (at closing)'),
            ('real_time', 'Perpetual (at invoicing)'),
        ],
        compute='_compute_valuation',
    )
    lot_valuated = fields.Boolean(
        string="Valuation by Lot/Serial",
        compute='_compute_lot_valuated', store=True, readonly=False,
        help="If checked, the valuation will be specific by Lot/Serial number.",
    )

    @api.depends('tracking')
    def _compute_lot_valuated(self):
        for product in self:
            if product.tracking == 'none':
                product.lot_valuated = False

    @api.depends_context('company')
    @api.depends('categ_id.property_cost_method')
    def _compute_cost_method(self):
        for product_template in self:
            product_template.cost_method = (
                product_template.categ_id.with_company(
                    product_template.company_id
                ).property_cost_method
                or (product_template.company_id or self.env.company).cost_method
            )

    @api.depends_context('company')
    @api.depends('categ_id.property_valuation')
    def _compute_valuation(self):
        pt_with_category = self.filtered('categ_id')
        (self - pt_with_category).valuation = 'periodic'
        for product_template in pt_with_category:
            product_template.valuation = product_template.categ_id.with_company(
                product_template.company_id
            ).property_valuation

    @api.onchange('standard_price')
    def _onchange_standard_price(self):
        res = super()._onchange_standard_price()
        if self.lot_valuated and any(p.quantity_svl for p in self.product_variant_ids):
            return {
                'warning': {
                    'title': _("Warning"),
                    'message': _("This is broken"),
                }
            }
        return res

    # -------------------------------------------------------------------------
    # Misc.
    # -------------------------------------------------------------------------
    def _get_product_accounts(self):
        """ Add the stock accounts related to product to the result of super()
        @return: dictionary which contains information regarding stock accounts and super (income+expense accounts)
        """
        accounts = super()._get_product_accounts()
        AccountAccount = self.env['account.account']
        accounts.update({
            'stock_valuation': (
                self.categ_id.property_stock_valuation_account_id
                or self.categ_id._fields['property_stock_valuation_account_id'].get_company_dependent_fallback(self.categ_id)
                or AccountAccount
            ),
            'stock_variation': (
                self.categ_id.property_stock_variation_account_id
                or self.categ_id._fields['property_stock_valuation_account_id'].get_company_dependent_fallback(self.categ_id)
                or AccountAccount
            ),
        })
        return accounts

    def get_product_accounts(self, fiscal_pos=None):
        """ Add the stock journal related to product to the result of super()
        @return: dictionary which contains all needed information regarding stock accounts and journal and super (income+expense accounts)
        """
        accounts = super().get_product_accounts(fiscal_pos=fiscal_pos)
        accounts.update({
            'stock_journal': (
                self.categ_id.property_stock_journal
                or self.categ_id._fields['property_stock_journal'].get_company_dependent_fallback(self.categ_id)
            )
        })
        return accounts


class ProductProduct(models.Model):
    _inherit = 'product.product'

    avg_cost = fields.Monetary(
        string="Average Cost", compute='_compute_value',
        compute_sudo=True, currency_field='company_currency_id')
    total_value = fields.Monetary(
        string="Total Value", compute='_compute_value',
        compute_sudo=True, currency_field='company_currency_id')
    company_currency_id = fields.Many2one(
        'res.currency', 'Valuation Currency', compute='_compute_value', compute_sudo=True,
        help="Technical field to correctly show the currently selected company's currency that corresponds "
             "to the totaled value of the product's valuation layers")

    @api.depends_context('to_date', 'company')
    def _compute_value(self):
        """Compute totals of multiple svl related values"""
        company_id = self.env.company
        self.company_currency_id = company_id.currency_id

        for product in self:
            qty_available = product.sudo(False).qty_available
            if product.cost_method in ['standard', 'average']:
                product.total_value = product.standard_price * qty_available
            else:
                product.total_value = product._run_fifo(qty_available)
            product.avg_cost = product.total_value / qty_available if qty_available else 0.0

    def write(self, vals):
        if 'lot_valuated' in vals:
            # lot_valuated must be updated from the ProductTemplate
            self.product_tmpl_id.write({'lot_valuated': vals.pop('lot_valuated')})
        return super().write(vals)

    # -------------------------------------------------------------------------
    # Actions
    # -------------------------------------------------------------------------
    def action_revaluation(self):
        self.ensure_one()
        ctx = dict(self.env.context, default_product_id=self.id, default_company_id=self.env.company.id)
        return {
            'name': _('Product Revaluation - %s', self.display_name),
            'view_mode': 'form',
            'res_model': 'stock.valuation.layer.revaluation',
            'view_id': self.env.ref('stock_account.stock_valuation_layer_revaluation_form_view').id,
            'type': 'ir.actions.act_window',
            'context': ctx,
            'target': 'new',
        }

    # -------------------------------------------------------------------------
    # Private
    # -------------------------------------------------------------------------

    def _get_cogs_value(self, quantity):
        if self.cost_method in ['standard', 'average']:
            return self.standard_price * quantity
        return self._run_fifo(quantity)

    def _run_avco(self):
        """ Recompute the average cost of the product base on the last closing
        inventory value and all the incoming moves during the period."""
        # TODO remove at the end and do at real time
        self.ensure_one()
        # Get value and quantity from last closing
        # TODO
        quantity = 0
        value = 0
        # Get value and quantity for all incoming
        moves_in = self.env['stock.move'].search([
            ('product_id', '=', self.id),
            ('is_in', '=', True),
        ])
        moves_out = self.env['stock.move'].search([
            ('product_id', '=', self.id),
            ('is_out', '=', True),
        ]) if self.valuation == 'real_time' else self.env['stock.move']
        # TODO convert to company UoM
        avco_value = 0
        moves = moves_in | moves_out
        moves.sorted('date')
        for move in moves:
            if move.is_in:
                in_value, in_qty = move._get_value(avco_value)
                value += in_value
                quantity += in_qty
                avco_value = value / quantity if quantity else 0
            else:
                out_qty = sum(move._get_out_move_lines().mapped('quantity'))
                value -= out_qty * avco_value
                quantity -= out_qty
        return avco_value

    def _run_fifo_get_stack(self):
        fifo_stack = []
        fifo_stack_size = self.qty_available  # Problem: Missing qty out but not invoiced

        moves_in = self.env['stock.move'].search([
            ('product_id', '=', self.id),
            ('is_in', '=', True),
        ], order='date asc', limit=fifo_stack_size)

        remaining_qty_on_last_move = 0
        # Go to the bottom of the stack
        while fifo_stack_size >= 0 and moves_in:
            move = moves_in[0]
            moves_in = moves_in[1:]
            in_qty = sum(move._get_in_move_lines().mapped('quantity'))
            fifo_stack.append(move)
            remaining_qty_on_last_move = min(in_qty, fifo_stack_size)
            fifo_stack_size -= in_qty
        return fifo_stack, remaining_qty_on_last_move

    def _run_fifo(self, quantity):
        """ Returns the value for the next outgoing product base on the qty give as argument."""
        self.ensure_one()
        fifo_cost = 0
        fifo_stack, __ = self._run_fifo_get_stack()

        # Going up to get the quantity in the argument
        while quantity >= 0 and fifo_stack:
            move = fifo_stack.pop()
            in_value, in_qty = move._get_value()
            if in_qty > quantity:
                in_value = in_value * quantity / in_qty
                in_qty = quantity
            fifo_cost += in_value
            quantity -= in_qty
        return fifo_cost

    def _update_standard_price(self):
        for product in self:
            if product.cost_method == 'standard':
                continue
            product.standard_price = product._run_avco()

    def _update_lots_standard_price(self):
        grouped_lots = self.env['stock.lot']._read_group(
            [('product_id', 'in', self.ids), ('product_id.lot_valuated', '=', True)],
            ['product_id'], ['id:recordset']
        )
        for product, lots in grouped_lots:
            lots.with_context(disable_auto_svl=True).write({"standard_price": product.standard_price})


class ProductCategory(models.Model):
    _inherit = 'product.category'

    anglo_saxon_accounting = fields.Boolean(
        string="Use Anglo-Saxon Accounting", compute="_compute_anglo_saxon_accounting",
        help="If checked, the product will be valued using the Anglo-Saxon accounting method.")
    property_valuation = fields.Selection(
        string="Inventory Valuation",
        selection=[
            ('periodic', 'Periodic (at closing)'),
            ('real_time', 'Perpetual (at invoicing)'),
        ],
        company_dependent=True, copy=True, tracking=True,
        help="""Manual: The accounting entries to value the inventory are not posted automatically.
        Automated: An accounting entry is automatically created to value the inventory when a product enters or leaves the company.
        """)
    property_cost_method = fields.Selection(
        string="Costing Method",
        selection=[
            ('standard', "Standard Price"),
            ('fifo', "First In First Out (FIFO)"),
            ('average', "Average Cost (AVCO)"),
        ],
        company_dependent=True, copy=True,
        default=lambda self: self.env.company.cost_method,
        help="""Standard Price: The products are valued at their standard cost defined on the product.
        Average Cost (AVCO): The products are valued at weighted average cost.
        First In First Out (FIFO): The products are valued supposing those that enter the company first will also leave it first.
        """,
        tracking=True,
    )
    property_stock_journal = fields.Many2one(
        'account.journal', 'Stock Journal', company_dependent=True,
        help="When doing automated inventory valuation, this is the Accounting Journal in which entries will be automatically posted when stock moves are processed.")
    property_stock_variation_account_id = fields.Many2one(
        'account.account', 'Stock Variation Account', company_dependent=True, ondelete='restrict',
        check_company=True,
        help="""Counterpart journal items for all incoming stock moves will be posted in this account, unless there is a specific valuation account
                set on the source location. This is the default value for all products in this category. It can also directly be set on each product.""")
    property_stock_valuation_account_id = fields.Many2one(
        'account.account', 'Stock Valuation Account', company_dependent=True, ondelete='restrict',
        check_company=True,
        help="""When automated inventory valuation is enabled on a product, this account will hold the current value of the products.""",)
    property_price_difference_account_id = fields.Many2one(
        'account.account', 'Price Difference Account', company_dependent=True, ondelete='restrict',
        check_company=True,
        help="""With perpetual valuation, this account will hold the price difference between the standard price and the bill price.""")

    @api.depends_context('company')
    def _compute_anglo_saxon_accounting(self):
        self.anglo_saxon_accounting = self.env.company.anglo_saxon_accounting
