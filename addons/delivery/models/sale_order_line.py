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

    def _is_productless_delivery(self):
        self.ensure_one()
        return self.is_delivery and not self.product_id and not self.display_type

    def _compute_invoice_policy(self):
        """Override of `sale` to always invoice delivery lines without product on the ordered
        quantities, as delivery costs are never "delivered"."""
        productless_delivery_lines = self.filtered(lambda line: line._is_productless_delivery())
        super(SaleOrderLine, self - productless_delivery_lines)._compute_invoice_policy()
        productless_delivery_lines.invoice_policy = "order"

    def _search_invoice_policy(self, operator, value):
        domain = super()._search_invoice_policy(operator, value)
        if operator not in ("in", "not in"):
            return domain
        productless_delivery_domain = (
            Domain("is_delivery", "=", True)
            & Domain("product_id", "=", False)
            & Domain("display_type", "=", False)
        )
        if ("order" in value) == (operator == "in"):
            return domain | productless_delivery_domain
        return domain & ~productless_delivery_domain

    def _compute_tax_ids(self):
        """Override of `sale` to compute the taxes of delivery lines without product from their
        delivery method."""
        delivery_lines = self.filtered(
            lambda line: line._is_productless_delivery() and line.order_id.carrier_id
        )
        super(SaleOrderLine, self - delivery_lines)._compute_tax_ids()
        for line in delivery_lines:
            order = line.order_id
            line.tax_ids = order.carrier_id._get_taxes(
                line.company_id, fiscal_position=order.partner_id and order.fiscal_position_id
            )

    def _prepare_invoice_line(self, **optional_values):
        """Override of `sale` to use the income account of the delivery method on the invoice
        lines of delivery lines without product."""
        res = super()._prepare_invoice_line(**optional_values)
        carrier = self.order_id.carrier_id
        if self._is_productless_delivery() and carrier and "account_id" not in optional_values:
            account = carrier._get_accounts(self.company_id)["income"]
            if account:
                res["account_id"] = self.order_id.fiscal_position_id.map_account(account).id
        return res

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

    def _compute_pricelist_item_id(self):
        delivery_lines = self.filtered("is_delivery")
        super(SaleOrderLine, self - delivery_lines)._compute_pricelist_item_id()
        delivery_lines.pricelist_item_id = False
