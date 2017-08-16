# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from datetime import datetime
from dateutil.relativedelta import relativedelta
from odoo.tools.misc import split_every
from psycopg2 import OperationalError

from odoo import api, fields, models, registry, _
from odoo.osv import expression
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT, float_compare, \
    float_round, pycompat

from odoo.exceptions import UserError

import logging
_logger = logging.getLogger(__name__)


class ProcurementGroup(models.Model):
    '''
    The procurement group class is used to group products together
    when computing procurements. (tasks, physical products, ...)

    The goal is that when you have one sales order of several products
    and the products are pulled from the same or several location(s), to keep
    having the moves grouped into pickings that represent the sales order.

    Used in: sales order (to group delivery order lines like the so), pull/push
    rules (to pack like the delivery order), on orderpoints (e.g. for wave picking
    all the similar products together).

    Grouping is made only if the source and the destination is the same.
    Suppose you have 4 lines on a picking from Output where 2 lines will need
    to come from Input (crossdock) and 2 lines coming from Stock -> Output As
    the four will have the same group ids from the SO, the move from input will
    have a stock.picking with 2 grouped lines and the move from stock will have
    2 grouped lines also.

    The name is usually the name of the original document (sales order) or a
    sequence computed if created manually.
    '''
    _name = 'procurement.group'
    _description = 'Procurement Requisition'
    _order = "id desc"

    partner_id = fields.Many2one('res.partner', 'Partner')
    name = fields.Char(
        'Reference',
        default=lambda self: self.env['ir.sequence'].next_by_code('procurement.group') or '',
        required=True)
    move_type = fields.Selection([
        ('direct', 'Partial'),
        ('one', 'All at once')], string='Delivery Type', default='direct',
        required=True)

    @api.model
    def run(self, values, doraise=True):
        for key in ('product_id','product_qty','location_id', 'name'):
            assert key in values
        values.setdefault('company_id', self.env['res.company']._company_default_get('procurement.group'))
        values.setdefault('priority', '1')
        values.setdefault('date_planned', fields.Datetime.now())
        rule = self._get_rule(values)

        if not rule:
            if doraise and False:
                raise UserError(_('No procurement rule found.'))
            else:
                msg = _('No procurement rule found. Update the inventory tab of the product form.')
                if values.get('orderpoint_id', False):
                    msg =_('No procurement rule found for orderpoint %s. Update the inventory tab of the product form.') % (values['orderpoint_id'].name,)
                activity = self.env['mail.activity'].create({
                    'activity_type_id': self.env.ref('mail.mail_activity_data_todo').id,
                    'note': msg,
                    'user_id': values['product_id'].responsible_id.id,
                    'res_id': values['product_id'].product_tmpl_id.id,
                    'res_model_id': self.env.ref('product.model_product_template').id,
                })
                return False
        self._run(values, rule, doraise)
        return True

    @api.model
    def _search_rule(self, values, domain):
        """ First find a rule among the ones defined on the procurement 
        group; then try on the routes defined for the product; finally fallback
        on the default behavior """
        if values.get('warehouse_id', False):
            domain = expression.AND([['|', ('warehouse_id', '=', values['warehouse_id'].id), ('warehouse_id', '=', False)], domain])
        Pull = self.env['procurement.rule']
        res = self.env['procurement.rule']
        if values.get('route_ids', False):
            res = Pull.search(expression.AND([[('route_id', 'in', values['route_ids'].ids)], domain]), order='route_sequence, sequence', limit=1)
        if not res:
            product_routes = values['product_id'].route_ids | values['product_id'].categ_id.total_route_ids
            if product_routes:
                res = Pull.search(expression.AND([[('route_id', 'in', product_routes.ids)], domain]), order='route_sequence, sequence', limit=1)
        if not res:
            warehouse_routes = values['warehouse_id'].route_ids
            if warehouse_routes:
                res = Pull.search(expression.AND([[('route_id', 'in', warehouse_routes.ids)], domain]), order='route_sequence, sequence', limit=1)
        return res

    @api.model
    def _get_rule(self, values):
        result = False
        location = values['location_id']
        while (not result) and location:
            result = self._search_rule(values, [('location_id','=', location.id)])
            location = location.location_id
        return result

    def _get_stock_move_values(self, values, rule, group_id):
        ''' Returns a dictionary of values that will be used to create a stock move from a procurement.
        This function assumes that the given procurement has a rule (action == 'move') set on it.

        :param procurement: browse record
        :rtype: dictionary
        '''
        date_expected = (datetime.strptime(values['date_planned'], DEFAULT_SERVER_DATETIME_FORMAT) - relativedelta(days=rule.delay or 0)).strftime(DEFAULT_SERVER_DATETIME_FORMAT)
        # it is possible that we've already got some move done, so check for the done qty and create
        # a new move with the correct qty
        qty_left = values['product_qty']
        return {
            'name': values['name'],
            'company_id': rule.company_id.id or rule.location_src_id.company_id.id or rule.location_id.company_id.id or values['company_id'].id,
            'product_id': values['product_id'].id,
            'product_uom': values['product_uom'].id,
            'product_uom_qty': qty_left,
            'partner_id': rule.partner_address_id.id or (values['group_id'] and values['group_id'].partner_id.id) or False,
            'location_id': rule.location_src_id.id,
            'location_dest_id': values['location_id'].id,
            'move_dest_ids': values.get('move_dest_id', False) and [(4, values['move_dest_id'].id)] or [],
            'rule_id': rule.id,
            'procure_method': rule.procure_method,
            'origin': values['origin'],
            'picking_type_id': rule.picking_type_id.id,
            'group_id': group_id,
            'route_ids': [(4, route.id) for route in values['route_ids']],
            'warehouse_id': rule.propagate_warehouse_id.id or rule.warehouse_id.id,
            'date': date_expected,
            'date_expected': date_expected,
            'propagate': rule.propagate,
            'priority': values.get('priority', "1"),
        }

    def _merge_domain(self, values, rule, group_id):
        return [
            ('group_id', '=', group_id), #extra logic?
            ('location_id', '=', rule.location_src_id.id),
            ('location_dest_id', '=', values['location_id'].id),
            ('picking_type_id', '=', rule.picking_type_id.id),
            ('picking_id.printed', '=', False),
            ('picking_id.state', 'in', ['draft', 'confirmed', 'waiting', 'partially_available', 'assigned']),
            ('picking_id.backorder_id', '=', False),
            ('product_id', '=', values['product_id'].id)]

    @api.multi
    def _run(self, values, rule, doraise=True):
        if rule.action == 'move':
            if not rule.location_src_id:
                msg = _('No source location defined on procurement rule: %s!') % (rule.name, )
                if doraise:
                    raise UserError(msg)
                else:
                    activity = self.env['mail.activity'].create({
                        'activity_type_id': self.env.ref('mail.mail_activity_data_todo').id,
                        'note': msg,
                        'user_id': values['product_id'].responsible_id.id,
                        'res_id': values['product_id'].product_tmpl_id.id,
                        'res_model_id': self.env.ref('product.model_product_template').id,
                    })
                    return False

            # create the move as SUPERUSER because the current user may not have the rights to do it (mto product launched by a sale for example)
            # Search if picking with move for it exists already:
            added_to_existing = False
            group_id = False
            if rule.group_propagation_option == 'propagate':
                group_id = values.get('group_id', False) and values['group_id'].id
            elif rule.group_propagation_option == 'fixed':
                group_id = rule.group_id.id

            if True: #rule.merge_moves:
                moves = self.env['stock.move'].search(self._merge_domain(values, rule, group_id), limit=1)

                if moves:
                    added_to_existing = True
                    data = {
                        'product_uom_qty': moves[0].product_uom_qty + values['product_qty'],
                        'move_dest_ids': [(4, x.id) for x in values.get('move_dest_ids', [])],
                    }
                    moves[0].write(data)
                    #Need to add a procurement if the move is mto again
                    if rule.procure_method == 'make_to_order':
                        values2 = values.copy()
                        values2.update({
                            'location_id': moves[0].location_id.id, 
                            'move_dest_id': moves[0].id, 
                            'move_ids': [(5)], 
                            'rule_id': False})
                        self.run(values2)

            if not added_to_existing:
                data = self._get_stock_move_values(values, rule, group_id)
                self.env['stock.move'].sudo().create(data).assign_picking()
            return True
        return False

    @api.model
    def run_scheduler(self, use_new_cursor=False, company_id=False):
        ''' Call the scheduler in order to check the running procurements (super method), to check the minimum stock rules
        and the availability of moves. This function is intended to be run for all the companies at the same time, so
        we run functions as SUPERUSER to avoid intercompanies and access rights issues. '''
        try:
            if use_new_cursor:
                cr = registry(self._cr.dbname).cursor()
                self = self.with_env(self.env(cr=cr))  # TDE FIXME

            # Minimum stock rules
            self.sudo()._procure_orderpoint_confirm(use_new_cursor=use_new_cursor, company_id=company_id)

            # Search all confirmed stock_moves and try to assign them
            confirmed_moves = self.env['stock.move'].search([('state', '=', 'confirmed')], limit=None, order='priority desc, date_expected asc')
            for moves_chunk in split_every(100, confirmed_moves.ids):
                # TDE CLEANME: muf muf
                self.env['stock.move'].browse(moves_chunk).action_assign()
                if use_new_cursor:
                    self._cr.commit()
            if use_new_cursor:
                self._cr.commit()
        finally:
            if use_new_cursor:
                try:
                    self._cr.close()
                except Exception:
                    pass
        return {}

    @api.model
    def _procurement_from_orderpoint_get_order(self):
        return 'location_id'

    @api.model
    def _procurement_from_orderpoint_get_grouping_key(self, orderpoint_ids):
        orderpoints = self.env['stock.warehouse.orderpoint'].browse(orderpoint_ids)
        return orderpoints.location_id.id

    @api.model
    def _procurement_from_orderpoint_get_groups(self, orderpoint_ids):
        """ Make groups for a given orderpoint; by default schedule all operations in one without date """
        return [{'to_date': False, 'procurement_values': dict()}]

    @api.model
    def _procurement_from_orderpoint_post_process(self, orderpoint_ids):
        return True

    def _get_orderpoint_domain(self, company_id=False):
        domain = [('company_id', '=', company_id)] if company_id else []
        domain += [('product_id.active', '=', True)]
        return domain

    @api.model
    def _procure_orderpoint_confirm(self, use_new_cursor=False, company_id=False):
        """ Create procurements based on orderpoints.
        :param bool use_new_cursor: if set, use a dedicated cursor and auto-commit after processing
            1000 orderpoints.
            This is appropriate for batch jobs only.
        """

        OrderPoint = self.env['stock.warehouse.orderpoint']
        domain = self._get_orderpoint_domain(company_id=company_id)
        orderpoints_noprefetch = OrderPoint.with_context(prefetch_fields=False).search(domain,
            order=self._procurement_from_orderpoint_get_order()).ids
        while orderpoints_noprefetch:
            if use_new_cursor:
                cr = registry(self._cr.dbname).cursor()
                self = self.with_env(self.env(cr=cr))
            OrderPoint = self.env['stock.warehouse.orderpoint']

            orderpoints = OrderPoint.browse(orderpoints_noprefetch[:1000])
            orderpoints_noprefetch = orderpoints_noprefetch[1000:]

            # Calculate groups that can be executed together
            location_data = defaultdict(lambda: dict(products=self.env['product.product'], orderpoints=self.env['stock.warehouse.orderpoint'], groups=list()))
            for orderpoint in orderpoints:
                key = self._procurement_from_orderpoint_get_grouping_key([orderpoint.id])
                location_data[key]['products'] += orderpoint.product_id
                location_data[key]['orderpoints'] += orderpoint
                location_data[key]['groups'] = self._procurement_from_orderpoint_get_groups([orderpoint.id])

            for location_id, location_data in pycompat.items(location_data):
                location_orderpoints = location_data['orderpoints']
                product_context = dict(self._context, location=location_orderpoints[0].location_id.id)
                substract_quantity = location_orderpoints._quantity_in_progress()

                for group in location_data['groups']:
                    if group.get('from_date'):
                        product_context['from_date'] = group['from_date'].strftime(DEFAULT_SERVER_DATETIME_FORMAT)
                    if group['to_date']:
                        product_context['to_date'] = group['to_date'].strftime(DEFAULT_SERVER_DATETIME_FORMAT)
                    product_quantity = location_data['products'].with_context(product_context)._product_available()
                    for orderpoint in location_orderpoints:
                        try:
                            op_product_virtual = product_quantity[orderpoint.product_id.id]['virtual_available']
                            if op_product_virtual is None:
                                continue
                            if float_compare(op_product_virtual, orderpoint.product_min_qty, precision_rounding=orderpoint.product_uom.rounding) <= 0:
                                qty = max(orderpoint.product_min_qty, orderpoint.product_max_qty) - op_product_virtual
                                remainder = orderpoint.qty_multiple > 0 and qty % orderpoint.qty_multiple or 0.0

                                if float_compare(remainder, 0.0, precision_rounding=orderpoint.product_uom.rounding) > 0:
                                    qty += orderpoint.qty_multiple - remainder

                                if float_compare(qty, 0.0, precision_rounding=orderpoint.product_uom.rounding) < 0:
                                    continue

                                qty -= substract_quantity[orderpoint.id]
                                qty_rounded = float_round(qty, precision_rounding=orderpoint.product_uom.rounding)
                                if qty_rounded > 0:
                                    new_procurement = self.env['procurement.group'].run(
                                        orderpoint._prepare_procurement_values(qty_rounded, **group['procurement_values']))
                                    self._procurement_from_orderpoint_post_process([orderpoint.id])
                                if use_new_cursor:
                                    cr.commit()

                        except OperationalError:
                            if use_new_cursor:
                                orderpoints_noprefetch += [orderpoint.id]
                                cr.rollback()
                                continue
                            else:
                                raise

            try:
                if use_new_cursor:
                    cr.commit()
            except OperationalError:
                if use_new_cursor:
                    cr.rollback()
                    continue
                else:
                    raise

            if use_new_cursor:
                cr.commit()
                cr.close()

        return {}

class ProcurementRule(models.Model):
    ''' A rule describe what a procurement should do; produce, buy, move, ... '''
    _name = 'procurement.rule'
    _description = "Procurement Rule"
    _order = "sequence, name"

    name = fields.Char(
        'Name', required=True, translate=True,
        help="This field will fill the packing origin and the name of its moves")
    active = fields.Boolean(
        'Active', default=True,
        help="If unchecked, it will allow you to hide the rule without removing it.")
    group_propagation_option = fields.Selection([
        ('none', 'Leave Empty'),
        ('propagate', 'Propagate'),
        ('fixed', 'Fixed')], string="Propagation of Procurement Group", default='propagate')
    group_id = fields.Many2one('procurement.group', 'Fixed Procurement Group')
    action = fields.Selection(
        selection=[('move', 'Move From Another Location')], string='Action',
        required=True)
    sequence = fields.Integer('Sequence', default=20)
    company_id = fields.Many2one('res.company', 'Company')
    location_id = fields.Many2one('stock.location', 'Procurement Location')
    location_src_id = fields.Many2one('stock.location', 'Source Location', help="Source location is action=move")
    route_id = fields.Many2one('stock.location.route', 'Route', required=True, ondelete='cascade')
    procure_method = fields.Selection([
        ('make_to_stock', 'Take From Stock'),
        ('make_to_order', 'Create Procurement')], string='Move Supply Method',
        default='make_to_stock', required=True,
        help="""Determines the procurement method of the stock move that will be generated: whether it will need to 'take from the available stock' in its source location or needs to ignore its stock and create a procurement over there.""")
    route_sequence = fields.Integer('Route Sequence', related='route_id.sequence', store=True)
    picking_type_id = fields.Many2one(
        'stock.picking.type', 'Operation Type',
        required=True,
        help="Operation Type determines the way the picking should be shown in the view, reports, ...")
    delay = fields.Integer('Number of Days', default=0)
    partner_address_id = fields.Many2one('res.partner', 'Partner Address')
    propagate = fields.Boolean(
        'Propagate cancel and split', default=True,
        help='If checked, when the previous move of the move (which was generated by a next procurement) is cancelled or split, the move generated by this move will too')
    warehouse_id = fields.Many2one('stock.warehouse', 'Served Warehouse', help='The warehouse this rule is for')
    propagate_warehouse_id = fields.Many2one(
        'stock.warehouse', 'Warehouse to Propagate',
        help="The warehouse to propagate on the created move/procurement, which can be different of the warehouse this rule is for (e.g for resupplying rules from another warehouse)")
    merge_moves = fields.Boolean('Merge Moves')

