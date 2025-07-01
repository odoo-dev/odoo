# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import float_is_zero, OrderedSet

import logging
_logger = logging.getLogger(__name__)


class StockMove(models.Model):
    _inherit = "stock.move"

    to_refund = fields.Boolean(
        string="Update quantities on SO/PO", copy=True,
        help='Trigger a decrease of the delivered/received quantity in the associated Sale Order/Purchase Order')
    company_currency_id = fields.Many2one('res.currency', related='company_id.currency_id', string='Company Currency', readonly=True)
    value = fields.Monetary("Value", currency_field='company_currency_id')
    price_unit = fields.Float("Price Unit")
    is_in = fields.Boolean(string='Is Incoming (valued)', compute='_compute_is_in', store=True)
    is_out = fields.Boolean(string='Is Outgoing (valued)', compute='_compute_is_out', store=True)
    is_valued = fields.Boolean(string='Is Valued', compute='_compute_is_valued')

    @api.depends('state', 'move_line_ids')
    def _compute_is_in(self):
        for move in self:
            if move.state != 'done':
                move.is_in = False
                continue
            move.is_in = move._is_in()

    @api.depends('state', 'move_line_ids')
    def _compute_is_out(self):
        for move in self:
            if move.state != 'done':
                move.is_out = False
                continue
            move.is_out = move._is_out()

    def _compute_is_valued(self):
        for move in self:
            move.is_valued = move.is_in or move.is_out

    def _action_done(self, cancel_backorder=False):
        moves_out = self.filtered(lambda m: m._is_out())
        moves_out._set_value()
        moves = super()._action_done(cancel_backorder=cancel_backorder)
        moves_in = moves.filtered(lambda m: m.is_in)
        moves_in.product_id._update_standard_price()
        return moves

    def _get_price_unit(self):
        """ Returns the unit price to value this stock move """
        self.ensure_one()
        return 0

    @api.model
    def _get_valued_types(self):
        """Returns a list of `valued_type` as strings. During `action_done`, we'll call
        `_is_[valued_type]'. If the result of this method is truthy, we'll consider the move to be
        valued.

        :returns: a list of `valued_type`
        :rtype: list
        """
        return ['in', 'out', 'dropshipped', 'dropshipped_returned']

    def _set_value(self):
        """Set the value of the move"""
        # TODO groupby product to avoid using twice the same stack
        for move in self:
            if move.product_id.cost_method == 'fifo':
                move.value = move.product_id._run_fifo(move.quantity)
            else:
                move.value = 0

    def _get_remaining_qty(self):
        """Returns the quantity currently in stock"""
        self.ensure_one()
        moves_stack, last_move_qty = self.product_id._run_fifo_get_stack()
        moves_stack = self.env['stock.move'].concat(*moves_stack)
        if self not in moves_stack:
            return 0
        if self == moves_stack[-1:]:
            return last_move_qty
        return self.quantity

    def _get_value(self, forced_std_price=False):
        """Returns the value and the quantity valued on the move
        In priority order:
        - Take value from accounting documents (invoices, bills)
        - Take value from quotations + landed costs
        - Take value from product cost

        Forced standard price is useful when we have to get the value
        of a move in the past with the standard price at that time.
        """
        self.ensure_one()
        # It probably needs a priority order:
        # 1. take from Invoice/Bills
        # 2. from SO/PO lines
        # 3. standard_price

        valued_qty = remaining_qty = sum(self._get_in_move_lines().mapped('quantity'))
        account_move_value, account_move_qty = self._get_value_from_account_move(remaining_qty)
        remaining_qty -= account_move_qty
        quotation_value, quotation_qty = self._get_value_from_quotation(remaining_qty)
        remaining_qty -= quotation_qty
        std_price = forced_std_price or self.product_id.standard_price
        std_price_value = std_price * remaining_qty
        return account_move_value + quotation_value + std_price_value, valued_qty

    def _get_value_from_account_move(self, quantity):
        return 0, 0

    def _get_value_from_quotation(self, quantity):
        return 0, 0

    def _get_move_directions(self):
        move_in_ids = set()
        move_out_ids = set()
        locations_should_be_valued = (self.move_line_ids.location_id | self.move_line_ids.location_dest_id).filtered(lambda l: l._should_be_valued())
        for record in self:
            for move_line in record.move_line_ids:
                if move_line._should_exclude_for_valuation() or not move_line.picked:
                    continue
                if move_line.location_id not in locations_should_be_valued and move_line.location_dest_id in locations_should_be_valued:
                    move_in_ids.add(record.id)
                if move_line.location_id in locations_should_be_valued and move_line.location_dest_id not in locations_should_be_valued:
                    move_out_ids.add(record.id)

        move_directions = defaultdict(set)
        for record in self:
            if record.id in move_in_ids and not record._is_dropshipped_returned():
                move_directions[record.id].add('in')

            if record.id in move_out_ids and not record._is_dropshipped():
                move_directions[record.id].add('out')

        return move_directions

    def _get_in_move_lines(self):
        """ Returns the `stock.move.line` records of `self` considered as incoming. It is done thanks
        to the `_should_be_valued` method of their source and destionation location as well as their
        owner.

        :returns: a subset of `self` containing the incoming records
        :rtype: recordset
        """
        res = OrderedSet()
        for move_line in self.move_line_ids:
            if not move_line.picked:
                continue
            if move_line._should_exclude_for_valuation():
                continue
            if not move_line.location_id._should_be_valued() and move_line.location_dest_id._should_be_valued():
                res.add(move_line.id)
        return self.env['stock.move.line'].browse(res)

    def _is_in(self):
        """Check if the move should be considered as entering the company so that the cost method
        will be able to apply the correct logic.

        :returns: True if the move is entering the company else False
        :rtype: bool
        """
        self.ensure_one()
        return self._get_in_move_lines() and not self._is_dropshipped_returned()

    def _get_out_move_lines(self):
        """ Returns the `stock.move.line` records of `self` considered as outgoing. It is done thanks
        to the `_should_be_valued` method of their source and destionation location as well as their
        owner.

        :returns: a subset of `self` containing the outgoing records
        :rtype: recordset
        """
        res = self.env['stock.move.line']
        for move_line in self.move_line_ids:
            if not move_line.picked:
                continue
            if move_line._should_exclude_for_valuation():
                continue
            if move_line.location_id._should_be_valued() and not move_line.location_dest_id._should_be_valued():
                res |= move_line
        return res

    def _is_out(self):
        """Check if the move should be considered as leaving the company so that the cost method
        will be able to apply the correct logic.

        :returns: True if the move is leaving the company else False
        :rtype: bool
        """
        self.ensure_one()
        return self._get_out_move_lines() and not self._is_dropshipped()

    def _is_dropshipped(self):
        """Check if the move should be considered as a dropshipping move so that the cost method
        will be able to apply the correct logic.

        :returns: True if the move is a dropshipping one else False
        :rtype: bool
        """
        self.ensure_one()
        return (self.location_id.usage == 'supplier' or (self.location_id.usage == 'transit' and not self.location_id.company_id)) \
           and (self.location_dest_id.usage == 'customer' or (self.location_dest_id.usage == 'transit' and not self.location_dest_id.company_id))

    def _is_dropshipped_returned(self):
        """Check if the move should be considered as a returned dropshipping move so that the cost
        method will be able to apply the correct logic.

        :returns: True if the move is a returned dropshipping one else False
        :rtype: bool
        """
        self.ensure_one()
        return (self.location_id.usage == 'customer' or (self.location_id.usage == 'transit' and not self.location_id.company_id)) \
           and (self.location_dest_id.usage == 'supplier' or (self.location_dest_id.usage == 'transit' and not self.location_dest_id.company_id))

    def _product_price_update(self):
        """ Outgoing moves lot valuation should recompute the standard price of the product as the
        layer price unit may differ from the product price unit """
        return

    def _should_exclude_for_valuation(self):
        """Determines if this move should be excluded from valuation based on its partner.
        :return: True if the move's restrict_partner_id is different from the company's partner (indicating
                it should be excluded from valuation), False otherwise.
        """
        self.ensure_one()
        return self.restrict_partner_id and self.restrict_partner_id != self.company_id.partner_id

    def _get_related_invoices(self):  # To be overridden in purchase and sale_stock
        """ This method is overrided in both purchase and sale_stock modules to adapt
        to the way they mix stock moves with invoices.
        """
        return self.env['account.move']

    def _is_returned(self, valued_type):
        self.ensure_one()
        if valued_type == 'in':
            return self.location_id and self.location_id.usage == 'customer'   # goods returned from customer
        if valued_type == 'out':
            return self.location_dest_id and self.location_dest_id.usage == 'supplier'
        return bool(self.picking_id.return_picking_id)
