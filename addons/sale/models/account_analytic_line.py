# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import UserError


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    def _domain_so_line(self):
        if self.env.context.get('from_services_and_material'):
            return []
        return [('qty_delivered_method', '=', 'analytic')]

    reinvoice_move_id = fields.Many2one(
        string="Invoice",
        comodel_name='account.move',
        readonly=True,
        copy=False,
        help="Invoice created from related SO line",
        index='btree_not_null',
    )
    so_line = fields.Many2one(
        string='Sales Order Item',
        comodel_name='sale.order.line',
        compute='_compute_so_line',
        store=True,
        readonly=False,
        index='btree_not_null',
        domain=lambda self: self._domain_so_line(),
    )
    order_id = fields.Many2one(
        string="Customer Order",
        comodel_name='sale.order',
        compute='_compute_order_id',
        store=True,
        readonly=False,
        index=True,
    )

    def _compute_so_line(self):
        for line in self:
            if not line.so_line:
                line.so_line = False

    def _compute_order_id(self):
        for line in self:
            if not line.order_id:
                line.order_id = False

    @api.model_create_multi
    def create(self, vals_list):
        if self.env.context.get('from_services_and_material'):
            plan_id = self.env.ref('sale.analytic_plan_sale_orders', raise_if_not_found=False)
            # If user deleted plan then fallback on project plan
            if not plan_id:
                plan_id, _other_plans = self.env['account.analytic.plan']._get_all_plans()

            column_name = plan_id._column_name()

            for vals in vals_list:
                order_id = self.env['sale.order'].browse(vals['order_id'])
                vals[column_name] = order_id._get_or_create_analytic_account(plan_id).id

            lines = super().create(vals_list)
            lines._sync_so_lines()
        else:
            lines = super().create(vals_list)

        return lines

    def write(self, vals):
        if self and self.env.context.get('from_services_and_material'):
            self.ensure_one()
            if 'unit_amount' in vals and self.so_line:
                # sync delivered quantity if quantity is changed
                self._sync_so_quantity(vals['unit_amount'] - self.unit_amount, self.so_line)

            res = super().write(vals)

            if 'order_id' in vals or 'product_id' in vals:
                # remove/update old sale order line
                self._unsync_so_lines()
                # create/update new sale order line for new order or product
                self._sync_so_lines()

            if 'name' in vals:
                # Update description on SO line
                self.so_line.name = vals['name']
        else:
            res = super().write(vals)

        return res

    def _check_can_write(self, vals):
        if self.sudo().filtered(
            lambda aal: aal.so_line.product_id.invoice_policy == 'delivery'
        ) and self.filtered(
            lambda aal: aal.reinvoice_move_id and aal.reinvoice_move_id.state != 'cancel'
        ):
            if any(field_name in vals for field_name in self._restricted_fields_when_invoiced()):
                raise UserError(self._get_invoiced_line_write_error())

        if (
            'unit_amount' in vals
            and vals['unit_amount'] < 0
            and self.env.context.get('from_services_and_material')
        ):
            raise UserError(self.env._("You cannot set a negative quantity on services."))

        super()._check_can_write(vals)

    def _restricted_fields_when_invoiced(self):
        return ['unit_amount', 'order_id', 'product_id', 'so_line', 'date']

    def _get_invoiced_line_write_error(self):
        return self.env._("You cannot modify already invoiced services.")

    @api.ondelete(at_uninstall=False)
    def _unlink_so_lines_except_invoiced(self):
        """Cleanup related sale order lines when analytic lines are deleted.

        Analytic lines linked to a posted invoice cannot be removed.

        For other lines, the related sale order line is deleted only if its
        delivery method is manual. Lines originating from timesheets or
        expenses are left unchanged.
        """
        if any(
            line.reinvoice_move_id and line.reinvoice_move_id.state == 'posted' for line in self
        ):
            raise UserError(self._get_invoiced_line_delete_error())
        self._unsync_so_lines()

    def _get_invoiced_line_delete_error(self):
        return self.env._("You cannot remove already invoiced services.")

    def _sync_so_lines(self):
        """Ensure that a corresponding sale order line exists and is synchronized
        with the current analytic line.

        Depending on the product's expense policy:

        - For 'cost' policy:
          A new sale order line with product's cost is always created with delivered quantity
          equal to the analytic line's unit amount.

        - For 'sales_price' policy:
          The method first attempts to find an existing sale order line
          matching the product. If found, its delivered quantity is updated.
          Otherwise, a new sale order line is created with product's sales price.

        The analytic line is then linked to the resulting sale order line.
        """
        for line in self:
            if not line.order_id or not line.product_id:
                continue

            so_line = self.env['sale.order.line']
            if (
                line.product_id.expense_policy == 'sales_price'
                and (so_line := line._get_existing_so_line())
            ):
                line._sync_so_quantity(line.unit_amount, so_line)
            line.so_line = so_line or line._create_so_line()

    def _unsync_so_lines(self):
        """Revert synchronization of delivered quantities on related sale order lines.

        - If the linked sale order line has an expense policy of `cost` and no
        ordered quantity, it indicates that the line was created solely for
        reinvoicing purposes and can be safely removed.
        - If the expense policy is `sales_price`, or `cost` with a non-zero
        ordered quantity, the delivered quantity on the related sale order line
        is decreased by the amount contributed by the analytic line being deleted.

        Lines originating from timesheets or expenses (i.e., not using the manual
        delivery method) are ignored.
        """
        for line in self.filtered(lambda line: line.so_line):
            if line.so_line.qty_delivered_method != 'manual':
                continue
            if (
                line.product_id.expense_policy == 'cost'
                and not line.so_line.product_uom_qty
                and line.unit_amount == line.so_line.qty_delivered
            ):
                line.so_line.unlink()
            elif line.product_id.expense_policy != 'no':
                line._sync_so_quantity(-line.unit_amount, line.so_line)

    def _get_existing_so_line(self):
        """Retrieve an existing sale order line from the related order that
        matches the product of the current analytic line and has manual quantity delivered method.
        """
        return self.order_id.order_line.filtered(
            lambda line: line.product_id == self.product_id
            and line.qty_delivered_method == 'manual',
        )[:1]

    def _create_so_line(self):
        """Create a new sale order line corresponding to this analytic line.

        The created line is initialized with delivered quantity based on the
        analytic line amount, unit price derived from the product's expense
        policy, and an optional custom description.

        :rtype: sale.order.line
        :return: The newly created sale order line record.
        """
        self.ensure_one()
        values = {
            'order_id': self.order_id.id,
            'product_id': self.product_id.id,
            'product_uom_id': self.product_uom_id.id,
            'product_uom_qty': 0,
            'qty_delivered': self.unit_amount,
        }

        if self.name:
            values['name'] = self.name

        if self.product_id.expense_policy == 'cost':
            values['price_unit'] = self.product_id.standard_price
        elif self.product_id.expense_policy == 'sales_price':
            values['price_unit'] = self.product_id.list_price

        return self.env['sale.order.line'].create(values)

    def _sync_so_quantity(self, quantity, so_line):
        """Adjust the delivered quantity on a linked sale order line based on
        changes to the analytic line.

        :param float quantity: New quantity value to synchronize with the sale order line.
        :param sale.order.line so_line: Sale order line whose delivered quantity must be updated.

        :rtype: None
        """
        so_line.qty_delivered += quantity
