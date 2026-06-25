# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"

    is_reward_line = fields.Boolean(
        string="Is a program reward line", compute="_compute_is_reward_line"
    )
    reward_id = fields.Many2one(comodel_name="loyalty.reward", ondelete="restrict", readonly=True)
    coupon_id = fields.Many2one(comodel_name="loyalty.card", ondelete="restrict", readonly=True)
    reward_identifier_code = fields.Char(
        help="Technical field used to link multiple reward lines from the same reward together."
    )
    points_cost = fields.Float(help="How much point this reward costs on the loyalty card.")

    def _compute_name(self):
        # Avoid computing the name for reward lines
        reward = self.filtered("reward_id")
        super(SaleOrderLine, self - reward)._compute_name()

    def _compute_discount(self):
        rewards = self.filtered("reward_id")
        return super(SaleOrderLine, self - rewards)._compute_discount()

    @api.depends("reward_id")
    def _compute_is_reward_line(self):
        for line in self:
            line.is_reward_line = bool(line.reward_id)

    def _compute_tax_ids(self):
        reward_lines = self.filtered("is_reward_line")
        super(SaleOrderLine, self - reward_lines)._compute_tax_ids()
        # Discount reward line is split per tax, the discount is set on the line but not on the
        # product as the product is the generic discount line.
        # In case of a free product, retrieving the tax on the line instead of the product won't
        # affect the behavior.
        for line in reward_lines:
            line = line.with_company(line.company_id)
            fpos = (
                line.order_id.fiscal_position_id
                or line.order_id.fiscal_position_id._get_fiscal_position(line.order_partner_id)
            )
            # If company_id is set, always filter taxes by the company
            taxes = line.tax_ids.filtered(
                lambda r: not line.company_id or r.company_id == line.company_id
            )
            line.tax_ids = fpos.map_tax(taxes)

    def _prepare_base_line_for_taxes_computation(self, **kwargs):
        """Override to add the special_type on coupon lines."""
        self.ensure_one()
        if self.reward_id and self.reward_id.reward_type == "discount":
            kwargs["special_type"] = "loyalty_discount"
        return super()._prepare_base_line_for_taxes_computation(**kwargs)

    def _get_display_price(self):
        # A product created from a promotion does not have a list_price.
        # The price_unit of a reward order line is computed by the promotion, so it can be used
        # directly.
        if self.is_reward_line and self.reward_id.reward_type != "product":
            return self.price_unit
        return super()._get_display_price()

    def _can_be_invoiced_alone(self):
        return super()._can_be_invoiced_alone() and not self.is_reward_line

    def _is_discount_line(self):
        return super()._is_discount_line() or self.reward_id.reward_type == "discount"

    def _reset_loyalty(self, complete=False):
        """Reset the line(s) to a state which does not impact reward computation.

        If complete is set to True we also remove the coupon and reward from the line(s).
        This option should be used when the line will be unlinked.

        Returns self
        """
        vals = {"points_cost": 0, "price_unit": 0, "technical_price_unit": 0}
        if complete:
            vals.update({"coupon_id": False, "reward_id": False})
        self.write(vals)
        return self

    def _get_confirmed_loyalty_pairs(self):
        return {
            (line.order_id.id, line.coupon_id.id)
            for line in self
            if line.state == "sale" and line.coupon_id
        }

    def _rebuild_loyalty_history_usage(self, pairs):
        loyalty_history = self.env["loyalty.history"].sudo()
        for order_id, coupon_id in pairs:
            order = self.env["sale.order"].browse(order_id).exists()
            coupon = self.env["loyalty.card"].browse(coupon_id).exists()
            if not order or not coupon:
                continue
            usage_history = loyalty_history.search([
                ("card_id", "=", coupon.id),
                ("order_model", "=", order._name),
                ("order_id", "=", order.id),
                ("used", ">", 0),
            ])
            if usage_history:
                loyalty_history.search([
                    ("linked_loyalty_history_id", "in", usage_history.ids),
                    ("issued", ">", 0),
                ])._release_compensation()
                usage_history.unlink()
            points_cost = sum(
                order.order_line.filtered(lambda line: line.coupon_id == coupon).mapped(
                    "points_cost"
                )
            )
            if points_cost:
                loyalty_history._create_consuming_history(
                    coupon,
                    points_cost,
                    {
                        "description": self.env._("Order %s", order.display_name),
                        "order_model": order._name,
                        "order_id": order.id,
                    },
                )

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        res._rebuild_loyalty_history_usage(res._get_confirmed_loyalty_pairs())
        return res

    def write(self, vals):
        update_loyalty_history = bool({"points_cost", "coupon_id"} & vals.keys())
        if update_loyalty_history:
            loyalty_pairs = self._get_confirmed_loyalty_pairs()
        res = super().write(vals)
        if update_loyalty_history:
            loyalty_pairs |= self._get_confirmed_loyalty_pairs()
            self._rebuild_loyalty_history_usage(loyalty_pairs)
        return res

    def unlink(self):
        # Remove related reward lines
        reward_coupon_set = {
            (line.reward_id, line.coupon_id, line.reward_identifier_code)
            for line in self
            if line.reward_id
        }
        related_lines = self.env["sale.order.line"]
        related_lines |= self.order_id.order_line.filtered(
            lambda line: (
                (line.reward_id, line.coupon_id, line.reward_identifier_code) in reward_coupon_set
            )
        )
        # Remove the line's coupon from order if it is the last line using that coupon
        coupons_to_unlink = self.env["loyalty.card"]
        for line in self:
            if line.coupon_id:
                # 2 cases:
                #  case 1: coupon has been applied directly
                #  case 2: coupon was created from a program
                if line.coupon_id in line.order_id.applied_coupon_ids:
                    line.order_id.applied_coupon_ids -= line.coupon_id
                elif (
                    line.coupon_id.order_id == line.order_id
                    and line.coupon_id.program_id.applies_on == "current"
                    and not any(
                        oLine.coupon_id == line.coupon_id and oLine not in related_lines
                        for oLine in line.order_id.order_line
                    )
                ):
                    # ondelete='restrict' would prevent deletion of the coupon unlink after
                    # unlinking lines.
                    coupons_to_unlink |= line.coupon_id
                    line.order_id.code_enabled_rule_ids = (
                        line.order_id.code_enabled_rule_ids.filtered(
                            lambda r: r.program_id != line.coupon_id.program_id
                        )
                    )
        loyalty_pairs = related_lines._get_confirmed_loyalty_pairs()
        res = super(SaleOrderLine, self | related_lines).unlink()
        self.env["sale.order.line"]._rebuild_loyalty_history_usage(loyalty_pairs)
        coupons_to_unlink.sudo().unlink()
        return res

    def _sellable_lines_domain(self):
        return super()._sellable_lines_domain() + [("reward_id", "=", False)]

    # === TOOLING ===#

    def _can_be_edited_on_portal(self):
        return super()._can_be_edited_on_portal() and not self.is_reward_line
