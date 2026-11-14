# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.fields import Domain


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"

    is_delivery = fields.Boolean(string="Is a Delivery", default=False)
    product_qty = fields.Float(
        string="Product Qty", compute="_compute_product_qty", digits="Product Unit"
    )
    recompute_delivery_price = fields.Boolean(related="order_id.recompute_delivery_price")

    def _can_be_invoiced_alone(self):
        return super()._can_be_invoiced_alone() and not self.is_delivery

    @api.depends("product_id", "product_uom_id", "product_uom_qty")
    def _compute_product_qty(self):
        for line in self:
            if not line.product_id or not line.product_uom_id or not line.product_uom_qty:
                line.product_qty = 0.0
                continue
            line.product_qty = line.product_uom_id._compute_quantity(
                line.product_uom_qty, line.product_id.uom_id
            )

    @api.ondelete(at_uninstall=False)
    def _unlink_remove_carrier(self):
        self.filtered("is_delivery").order_id.carrier_id = False

    def _is_delivery(self):
        self.ensure_one()
        return self.is_delivery

    def _get_accrual_domain(self, date=False):
        """ Reused by account.accrued.orders.wizard and stock_account's
        Stock Valuation report. """
        domain = super()._get_accrual_domain(date)
        domain = Domain.AND([domain, [('is_delivery', '=', False)]])
        return domain

    def _get_invalid_delivery_weight_lines(self):
        """Retrieve lines containing physical products with no weight defined."""
        return self.filtered(
            lambda line: (
                line.product_qty > 0
                and line.product_id.type not in ("service", "combo")
                and line.product_id.weight == 0
            )
        )

    # override to allow deletion of delivery line in a confirmed order
    def _check_line_unlink(self):
        """
        Extend the allowed deletion policy of SO lines.

        Lines that are delivery lines can be deleted from a confirmed order.

        :rtype: recordset sale.order.line
        :returns: set of lines that cannot be deleted
        """
        undeletable_lines = super()._check_line_unlink()
        return undeletable_lines.filtered(lambda line: not line.is_delivery)

    def _compute_invoice_policy(self):
        # Shipping costs are not delivered as such: always invoice them on ordered quantities.
        delivery_lines = self.filtered(lambda line: line.is_delivery and not line.product_id)
        super(SaleOrderLine, self - delivery_lines)._compute_invoice_policy()
        delivery_lines.invoice_policy = "order"

    def _search_invoice_policy(self, operator, value):
        if operator != "in":
            return NotImplemented
        delivery_domain = Domain("is_delivery", "=", True) & Domain("product_id", "=", False)
        return (super()._search_invoice_policy(operator, value) & ~delivery_domain) | (
            delivery_domain if "order" in value else Domain.FALSE
        )

    def _prepare_invoice_line(self, **optional_values):
        res = super()._prepare_invoice_line(**optional_values)
        if (
            self.is_delivery
            and not self.product_id
            and self.order_id.carrier_id
            and "account_id" not in optional_values
        ):
            order = self.order_id
            account = order.carrier_id._get_delivery_accounts(order.company_id)["income"]
            if account:
                res["account_id"] = order.fiscal_position_id.map_account(account).id
        return res

    def _compute_pricelist_item_id(self):
        delivery_lines = self.filtered("is_delivery")
        super(SaleOrderLine, self - delivery_lines)._compute_pricelist_item_id()
        delivery_lines.pricelist_item_id = False
