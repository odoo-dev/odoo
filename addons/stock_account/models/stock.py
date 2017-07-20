# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import float_compare, float_round, pycompat

import logging
_logger = logging.getLogger(__name__)


class StockInventory(models.Model):
    _inherit = "stock.inventory"

    accounting_date = fields.Date(
        'Force Accounting Date',
        help="Choose the accounting date at which you want to value the stock "
             "moves created by the inventory instead of the default one (the "
             "inventory end date)")

    @api.multi
    def post_inventory(self):
        acc_inventories = self.filtered(lambda inventory: inventory.accounting_date)
        for inventory in acc_inventories:
            res = super(StockInventory, inventory.with_context(force_period_date=inventory.accounting_date)).post_inventory()
        other_inventories = self - acc_inventories
        if other_inventories:
            res = super(StockInventory, other_inventories).post_inventory()
        return res


class StockLocation(models.Model):
    _inherit = "stock.location"

    valuation_in_account_id = fields.Many2one(
        'account.account', 'Stock Valuation Account (Incoming)',
        domain=[('internal_type', '=', 'other'), ('deprecated', '=', False)],
        help="Used for real-time inventory valuation. When set on a virtual location (non internal type), "
             "this account will be used to hold the value of products being moved from an internal location "
             "into this location, instead of the generic Stock Output Account set on the product. "
             "This has no effect for internal locations.")
    valuation_out_account_id = fields.Many2one(
        'account.account', 'Stock Valuation Account (Outgoing)',
        domain=[('internal_type', '=', 'other'), ('deprecated', '=', False)],
        help="Used for real-time inventory valuation. When set on a virtual location (non internal type), "
             "this account will be used to hold the value of products being moved out of this location "
             "and into an internal location, instead of the generic Stock Output Account set on the product. "
             "This has no effect for internal locations.")


class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'
    
    @api.multi
    def write(self, vals):
        super(StockMoveLine, self).write(vals)
        if 'qty_done' in vals:
            for move in self.mapped('move_id').filtered(lambda m: m.state == 'done'):
                if move.location_id.usage not in ('internal', 'transit') and move.location_dest_id.usage in ('internal', 'transit'):
                    move.value = move.quantity_done * move.price_unit
                move.replay()


class StockMove(models.Model):
    _inherit = "stock.move"

    to_refund = fields.Boolean(string="To Refund (update SO/PO)",
                               help='Trigger a decrease of the delivered/received quantity in the associated Sale Order/Purchase Order')

    value = fields.Float()
    cumulated_value = fields.Float()
    remaining_qty = fields.Float()
    last_done_move_id = fields.Many2one('stock.move')
    last_done_remaining_qty = fields.Float()
    last_done_qty = fields.Float()

    # TODO: add constraints remaining_qty > 0
    # TODO: add constrain price_unit = 0 on done move?

    @api.multi
    def _get_price_unit(self):
        self.ensure_one()
        if self.product_id.cost_method == 'average':
            return self.product_id.average_price or self.product_id.standard_price
        if self.product_id.cost_method == 'fifo':
            move = self.search([('product_id', '=', self.product_id.id),
                         ('state', '=', 'done'), 
                         ('location_id.usage', '=', 'internal'), 
                         ('location_dest_id.usage', '!=', 'internal'),
                         ('company_id', '=', self.company_id.id)], order='date desc', limit=1)
            if move:
                return move.price_unit or self.product_id.standard_price
        return self.product_id.standard_price

    def _update_future_cumulated_value(self, value):
        self.ensure_one()
        moves = self.search([('state', '=', 'done'), 
                     ('date', '>=',  self.date),
                     ('id', '>', self.id), 
                     ('product_id', '=', self.product_id.id), 
                     ('company_id', '=', self.company_id.id),
                     '|', '&', ('location_id.usage', 'in', ('internal', 'transit')), 
                    ('location_dest_id.usage', 'not in', ('internal', 'transit')), 
                    '&', ('location_id.usage', 'not in', ('internal', 'transit')), 
                    ('location_dest_id.usage', 'in', ('internal', 'transit'))])
        for move in moves:
            move.cumulated_value += value

    @api.multi
    def replay_average(self):
        # Easy scenario: avergae /done
        # search last move before this one
        
        # This should be an in or out move
        start_move = self.search([('product_id', '=', self.product_id.id), 
                     ('state', '=', 'done'), 
                     ('date', '<=', self.date), 
                     ('id', '<', self.id),
                     ('company_id', '=', self.company_id.id), 
                     '|', '&', ('location_id.usage', 'in', ('internal', 'transit')), 
                        ('location_dest_id.usage', 'not in', ('internal', 'transit')), 
                        '&', ('location_id.usage', 'not in', ('internal', 'transit')), 
                        ('location_dest_id.usage', 'in', ('internal', 'transit'))], limit=1, order='date desc') #filter on outgoing/incoming moves
        domain = [('product_id', '=', self.product_id.id), 
                     ('state', '=', 'done'), 
                     ('company_id', '=', self.company_id.id),
                     '|', '&', ('location_id.usage', 'in', ('internal', 'transit')), 
                        ('location_dest_id.usage', 'not in', ('internal', 'transit')), 
                        '&', ('location_id.usage', 'not in', ('internal', 'transit')), 
                        ('location_dest_id.usage', 'in', ('internal', 'transit'))]
        if start_move:
            domain = [('date', '>=', start_move.date),
                     ('id', '>', start_move.id)] + domain
        next_moves = self.search(domain, order='date, id') # filter on outgoing/incoming moves
        if start_move:
            last_cumulated_value = start_move.cumulated_value
            last_done_qty_available = start_move.last_done_qty
        else:
            last_cumulated_value = 0.0
            last_done_qty_available = 0.0
        for move in next_moves:
            if move.location_id.usage in ('internal', 'transit') and move.location_dest_id.usage not in ('internal', 'transit'):
                if last_done_qty_available:
                    move.value = - ((last_cumulated_value / last_done_qty_available) * move.product_qty)
                last_done_qty_available -= move.product_qty
            else:
                last_done_qty_available += move.product_qty
            last_cumulated_value = move.cumulated_value + move.value
            move.write({'cumulated_value': last_cumulated_value, 
                        'last_done_qty': last_done_qty_available})
            

    def replay_fifo(self):
        # search last out move before/equal to this one
        start_move = self.search([('product_id', '=', self.product_id.id), 
                     ('state', '=', 'done'),
                     ('last_done_move_id', '!=', False),
                     '|', ('date', '<', self.date),
                     '&', ('date', '=', self.date), ('id', '<', self.id), 
                     ('location_id.usage', 'in', ('internal', 'transit')), 
                     ('location_dest_id.usage', 'not in', ('internal', 'transit'))], limit=1, order='date desc, id desc') #filter on outgoing/incoming moves
        in_domain = [('product_id', '=', self.product_id.id), 
                     ('state', '=', 'done'), 
                     ('location_id.usage', 'not in', ('internal', 'transit')), 
                     ('location_dest_id.usage', 'in', ('internal', 'transit'))]
        out_date = False
        out_id = False
        if start_move and (start_move.last_done_move_id.date < start_move.date or (start_move.last_done_move_id.date == start_move.date and start_move.last_done_move_id.id < start_move.id)):
            first_in_move = start_move.last_done_move_id
            first_in_remaining_qty = start_move.last_done_remaining_qty
            in_domain += ['|', ('date', '>', start_move.last_done_move_id.date), 
                          '&', ('id', '>', start_move.last_done_move_id.id), ('date', '=', start_move.last_done_remaining_qty)]
            out_date = start_move.date
            out_id = start_move.id
        else:
            first_in_move = False
            first_in_remaining_qty = 0
            out_move = self.search([('product_id', '=', self.product_id.id),
                                    ('state', '=', 'done'),
                                    ('location_id.usage', 'in', ('internal', 'transit')), 
                                    ('location_dest_id.usage', 'not in', ('internal', 'transit'))], order='date, id', limit=1)
            if out_move:
                out_date = out_move.date
                out_id = out_move.id
        in_moves_needed = self.search(in_domain)
        if out_date:
            next_out_moves = self.search([('product_id', '=', self.product_id.id), 
                         ('state', '=', 'done'), 
                         ('date', '>=', out_date),
                         ('id', '>=', out_id),
                         ('location_id.usage', 'in', ('internal', 'transit')), 
                         ('location_dest_id.usage', 'not in', ('internal', 'transit'))], order='date, id') # filter on outgoing/incoming moves
            last_in_move = first_in_move
            last_remaining_qty = first_in_remaining_qty
            if not first_in_move or last_remaining_qty == 0.0 and in_moves_needed:
                last_in_move = in_moves_needed[0] #TODO: pop(0)?
                in_moves_needed -= in_moves_needed[0]
                last_remaining_qty = last_in_move.product_qty
            for out_move in next_out_moves:
                total_qty = out_move.product_qty
                total_value = 0
                stop = False
                while(total_qty > 0) and not stop: # only after you cannot 
                    if last_remaining_qty < total_qty:
                        total_qty -= last_remaining_qty
                        total_value += last_remaining_qty * last_in_move.price_unit
                        last_in_move.remaining_qty = 0.0
                        if in_moves_needed:
                            last_in_move = in_moves_needed[0]
                            in_moves_needed -= in_moves_needed[0]
                            last_remaining_qty = last_in_move.product_qty
                        else:
                            stop = True
                    else:
                        total_value += total_qty * last_in_move.price_unit
                        last_remaining_qty -= total_qty
                        last_in_move.remaining_qty = last_remaining_qty
                        total_qty = 0
                out_move.write({'last_done_remaining_qty': last_remaining_qty, 
                                'last_done_move_id': last_in_move.id, 
                                'value': -total_value})
                out_move.remaining_qty = total_qty
            for move in in_moves_needed:
                move.remaining_qty = move.product_qty
        domain = [('product_id', '=', self.product_id.id), 
                     ('state', '=', 'done'), 
                     ('company_id', '=', self.company_id.id),
                     '|', '&', ('location_id.usage', 'in', ('internal', 'transit')), 
                        ('location_dest_id.usage', 'not in', ('internal', 'transit')), 
                        '&', ('location_id.usage', 'not in', ('internal', 'transit')), 
                        ('location_dest_id.usage', 'in', ('internal', 'transit'))]
        use_start_move = start_move and (start_move.last_done_move_id.date < start_move.date or (start_move.last_done_move_id.date == start_move.date and start_move.last_done_move_id.id < start_move.id))
        if use_start_move:
            domain = [('date', '>=', start_move.date),
                     ('id', '>', start_move.id)] + domain
        next_moves = self.search(domain, order='date, id')
        if use_start_move:
            cumulated_value = start_move.cumulated_value
            qty_available = start_move.last_done_remaining_qty
        else:
            cumulated_value = 0.0
            qty_available = 0.0
        for move in next_moves:
            if move.location_dest_id.usage in ('internal', 'transit'):
                qty_available += move.product_qty
            else:
                qty_available -= move.product_qty
            cumulated_value += move.value
            move.write({'last_done_qty': qty_available,
                        'cumulated_value': cumulated_value})

    def replay(self):
        if self.product_id.cost_method == 'fifo':
            self.replay_fifo()
        elif self.product_id.cost_method == 'average':
            self.replay_average()

    @api.multi
    def action_done(self):
        qty_available = {}
        for move in self:
            #Should write move.price_unit here maybe, certainly on incoming
            if move.product_id.cost_method == 'average':
                qty_available[move.product_id.id] = move.product_id.qty_available
        res = super(StockMove, self).action_done()
        for move in res:
            if move.location_id.usage not in ('internal', 'transit') and move.location_dest_id.usage in ('internal', 'transit'):
                if move.product_id.cost_method in ['fifo', 'average']:
                    if not move.price_unit:
                        move.price_unit = move._get_price_unit()
                    move_value = move.price_unit * move.product_qty
                    move.write({'value': move_value, 
                                'cumulated_value': move.product_id._get_latest_cumulated_value(not_move=move) + move_value, 
                                'remaining_qty': move.product_qty})
                    if move.product_id.cost_method == 'fifo':
                        # If you find an out with qty_remaining (because of negative stock), you can change it over there
                        candidates_out = move.product_id._get_candidates_out_move()
                        qty_to_take = move.product_qty
                        for candidate in candidates_out:
                            if candidate.remaining_qty < qty_to_take:
                                qty_taken_on_candidate = candidate.remaining_qty
                            else:
                                qty_taken_on_candidate = qty_to_take
                            move.remaining_qty -= qty_taken_on_candidate
                            qty_to_take -= qty_taken_on_candidate
                            candidate_value = candidate.value - move.price_unit * qty_taken_on_candidate
                            candidate.write({'value': candidate_value, 
                                             'cumulated_value': candidate.cumulated_value - move.price_unit * qty_taken_on_candidate, 
                                             'price_unit': - (candidate_value / candidate.product_qty),
                                             'last_done_move_id': move.id,
                                             'remaining_qty': candidate.remaining_qty - qty_taken_on_candidate})
                            # Might be replaced be reusable code
                            candidate._update_future_cumulated_value(move.price_unit * qty_taken_on_candidate)
                            if qty_to_take <= 0:
                                break
                    move.last_done_qty = move.product_id.qty_available
                else:
                    move.price_unit = move.product_id.standard_price
                    move.value = move.price_unit * move.product_qty
            elif move.location_id.usage in ('internal', 'transit') and move.location_dest_id.usage not in ('internal', 'transit'):
                if move.product_id.cost_method == 'fifo':
                    qty_to_take = move.product_qty
                    tmp_value = 0
                    candidates = move.product_id._get_candidates_move()
                    last_candidate = False
                    for candidate in candidates:
                        if candidate.remaining_qty <= qty_to_take:
                            qty_taken_on_candidate = candidate.remaining_qty
                        else:
                            qty_taken_on_candidate = qty_to_take
                        tmp_value += qty_taken_on_candidate * candidate.price_unit
                        candidate.remaining_qty -= qty_taken_on_candidate
                        qty_to_take -= qty_taken_on_candidate
                        if qty_to_take == 0:
                            break
                        last_candidate = candidate
                    if last_candidate:
                        move.last_done_move_id = last_candidate.id
                        move.last_done_remaining_qty = last_candidate.remaining_qty
                    if qty_to_take > 0:
                        move.remaining_qty = qty_to_take # In case there are no candidates to match, put standard price on it
                    move.value = -tmp_value
                    move.cumulated_value = move.product_id._get_latest_cumulated_value(not_move=move) + move.value
                    move.last_done_qty = move.product_id.qty_available
                elif move.product_id.cost_method == 'average':
                    curr_rounding = move.company_id.currency_id.rounding
                    avg_price_unit = float_round(move.product_id._get_latest_cumulated_value(not_move=move) / qty_available[move.product_id.id], precision_rounding=curr_rounding)
                    move_value = float_round(-avg_price_unit * move.product_qty, precision_rounding=curr_rounding)
                    move.write({'value': move_value,
                                'cumulated_value': move.product_id._get_latest_cumulated_value(not_move=move) + move_value,
                                'last_done_qty': move.product_id.qty_available,
                                })
                elif move.product_id.cost_method == 'standard':
                    move.value = - move.product_id.standard_price * move.product_qty
                
        for move in res.filtered(lambda m: m.product_id.valuation == 'real_time'):
            move._account_entry_move()
        return res

    @api.multi
    def _get_accounting_data_for_valuation(self):
        """ Return the accounts and journal to use to post Journal Entries for
        the real-time valuation of the quant. """
        self.ensure_one()
        accounts_data = self.product_id.product_tmpl_id.get_product_accounts()

        if self.location_id.valuation_out_account_id:
            acc_src = self.location_id.valuation_out_account_id.id
        else:
            acc_src = accounts_data['stock_input'].id

        if self.location_dest_id.valuation_in_account_id:
            acc_dest = self.location_dest_id.valuation_in_account_id.id
        else:
            acc_dest = accounts_data['stock_output'].id

        acc_valuation = accounts_data.get('stock_valuation', False)
        if acc_valuation:
            acc_valuation = acc_valuation.id
        if not accounts_data.get('stock_journal', False):
            raise UserError(_('You don\'t have any stock journal defined on your product category, check if you have installed a chart of accounts'))
        if not acc_src:
            raise UserError(_('Cannot find a stock input account for the product %s. You must define one on the product category, or on the location, before processing this operation.') % (self.product_id.name))
        if not acc_dest:
            raise UserError(_('Cannot find a stock output account for the product %s. You must define one on the product category, or on the location, before processing this operation.') % (self.product_id.name))
        if not acc_valuation:
            raise UserError(_('You don\'t have any stock valuation account defined on your product category. You must define one before processing this operation.'))
        journal_id = accounts_data['stock_journal'].id
        return journal_id, acc_src, acc_dest, acc_valuation
    
    def _prepare_account_move_line(self, qty, cost, credit_account_id, debit_account_id):
        """
        Generate the account.move.line values to post to track the stock valuation difference due to the
        processing of the given quant.
        """
        self.ensure_one()

        if self._context.get('force_valuation_amount'):
            valuation_amount = self._context.get('force_valuation_amount')
        else:
            valuation_amount = cost

        # the standard_price of the product may be in another decimal precision, or not compatible with the coinage of
        # the company currency... so we need to use round() before creating the accounting entries.
        debit_value = self.company_id.currency_id.round(valuation_amount)

        # check that all data is correct
        if self.company_id.currency_id.is_zero(debit_value):
            if self.product_id.cost_method == 'standard':
                raise UserError(_("The found valuation amount for product %s is zero. Which means there is probably a configuration error. Check the costing method and the standard price") % (self.product_id.name,))
            return []
        credit_value = debit_value

        if self.product_id.cost_method == 'average' and self.company_id.anglo_saxon_accounting:
            # in case of a supplier return in anglo saxon mode, for products in average costing method, the stock_input
            # account books the real purchase price, while the stock account books the average price. The difference is
            # booked in the dedicated price difference account.
            if self.location_dest_id.usage == 'supplier' and self.origin_returned_move_id and self.origin_returned_move_id.purchase_line_id:
                debit_value = self.origin_returned_move_id.price_unit * qty
            # in case of a customer return in anglo saxon mode, for products in average costing method, the stock valuation
            # is made using the original average price to negate the delivery effect.
            if self.location_id.usage == 'customer' and self.origin_returned_move_id:
                debit_value = self.origin_returned_move_id.price_unit * qty
                credit_value = debit_value
        partner_id = (self.picking_id.partner_id and self.env['res.partner']._find_accounting_partner(self.picking_id.partner_id).id) or False
        debit_line_vals = {
            'name': self.name,
            'product_id': self.product_id.id,
            'quantity': qty,
            'product_uom_id': self.product_id.uom_id.id,
            'ref': self.picking_id.name,
            'partner_id': partner_id,
            'debit': debit_value,
            'credit': 0,
            'account_id': debit_account_id,
        }
        credit_line_vals = {
            'name': self.name,
            'product_id': self.product_id.id,
            'quantity': qty,
            'product_uom_id': self.product_id.uom_id.id,
            'ref': self.picking_id.name,
            'partner_id': partner_id,
            'credit': credit_value,
            'debit': 0,
            'account_id': credit_account_id,
        }
        res = [(0, 0, debit_line_vals), (0, 0, credit_line_vals)]
        if credit_value != debit_value:
            # for supplier returns of product in average costing method, in anglo saxon mode
            diff_amount = debit_value - credit_value
            price_diff_account = self.product_id.property_account_creditor_price_difference
            if not price_diff_account:
                price_diff_account = self.product_id.categ_id.property_account_creditor_price_difference_categ
            if not price_diff_account:
                raise UserError(_('Configuration error. Please configure the price difference account on the product or its category to process this operation.'))
            price_diff_line = {
                'name': self.name,
                'product_id': self.product_id.id,
                'quantity': qty,
                'product_uom_id': self.product_id.uom_id.id,
                'ref': self.picking_id.name,
                'partner_id': partner_id,
                'credit': diff_amount > 0 and diff_amount or 0,
                'debit': diff_amount < 0 and -diff_amount or 0,
                'account_id': price_diff_account.id,
            }
            res.append((0, 0, price_diff_line))
        return res

    def _create_account_move_line(self, credit_account_id, debit_account_id, journal_id):
        self.ensure_one()
        AccountMove = self.env['account.move']
        move_lines = self._prepare_account_move_line(self.product_qty, abs(self.value), credit_account_id, debit_account_id)
        if move_lines:
            date = self._context.get('force_period_date', fields.Date.context_today(self))
            new_account_move = AccountMove.create({
                'journal_id': journal_id,
                'line_ids': move_lines,
                'date': date,
                'ref': self.picking_id.name})
            new_account_move.post()

    def _account_entry_move(self):
        """ Accounting Valuation Entries """
        self.ensure_one()
        if self.product_id.type != 'product':
            # no stock valuation for consumable products
            return False
        if self.restrict_partner_id:
            # if the move isn't owned by the company, we don't make any valuation
            return False

        location_from = self.location_id
        location_to = self.location_dest_id
        company_from = location_from.usage == 'internal' and location_from.company_id or False
        company_to = location_to and (location_to.usage == 'internal') and location_to.company_id or False

        # Create Journal Entry for products arriving in the company; in case of routes making the link between several
        # warehouse of the same company, the transit location belongs to this company, so we don't need to create accounting entries
        if company_to and (self.location_id.usage not in ('internal', 'transit') and self.location_dest_id.usage == 'internal' or company_from != company_to):
            journal_id, acc_src, acc_dest, acc_valuation = self._get_accounting_data_for_valuation()
            if location_from and location_from.usage == 'customer':  # goods returned from customer
                self.with_context(force_company=company_to.id)._create_account_move_line(acc_dest, acc_valuation, journal_id)
            else:
                self.with_context(force_company=company_to.id)._create_account_move_line(acc_src, acc_valuation, journal_id)

        # Create Journal Entry for products leaving the company
        if company_from and (self.location_id.usage == 'internal' and self.location_dest_id.usage not in ('internal', 'transit') or company_from != company_to):
            journal_id, acc_src, acc_dest, acc_valuation = self._get_accounting_data_for_valuation()
            if location_to and location_to.usage == 'supplier':  # goods returned to supplier
                self.with_context(force_company=company_from.id)._create_account_move_line(acc_valuation, acc_src, journal_id)
            else:
                self.with_context(force_company=company_from.id)._create_account_move_line(acc_valuation, acc_dest, journal_id)

        if self.company_id.anglo_saxon_accounting and self.location_id.usage == 'supplier' and self.location_dest_id.usage == 'customer':
            # Creates an account entry from stock_input to stock_output on a dropship move. https://github.com/odoo/odoo/issues/12687
            journal_id, acc_src, acc_dest, acc_valuation = self._get_accounting_data_for_valuation()
            self.with_context(force_company=self.company_id.id)._create_account_move_line(acc_src, acc_dest, journal_id)


class StockReturnPicking(models.TransientModel):
    _inherit = "stock.return.picking"

    @api.multi
    def _create_returns(self):
        new_picking_id, pick_type_id = super(StockReturnPicking, self)._create_returns()
        new_picking = self.env['stock.picking'].browse([new_picking_id])
        for move in new_picking.move_lines:
            return_picking_line = self.product_return_moves.filtered(lambda r: r.move_id == move.origin_returned_move_id)
            if return_picking_line and return_picking_line.to_refund:
                move.to_refund = True
        return new_picking_id, pick_type_id


class StockReturnPickingLine(models.TransientModel):
    _inherit = "stock.return.picking.line"

    to_refund = fields.Boolean(string="To Refund (update SO/PO)", help='Trigger a decrease of the delivered/received quantity in the associated Sale Order/Purchase Order')
