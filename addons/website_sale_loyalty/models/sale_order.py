# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.http import request
from odoo.osv import expression
from odoo.tools import float_is_zero


class SaleOrder(models.Model):
    _inherit = "sale.order"

    # List of disabled rewards for automatic claim
    disabled_auto_rewards = fields.Many2many("loyalty.reward", relation="sale_order_disabled_auto_rewards_rel")

    def _get_program_domain(self):
        res = super()._get_program_domain()
        # Replace `sale_ok` leaf with `ecommerce_ok` if order is linked to a website
        if self.website_id:
            for idx, leaf in enumerate(res):
                if leaf[0] != 'sale_ok':
                    continue
                res[idx] = ('ecommerce_ok', '=', True)
                break
        return expression.AND([res, [('website_id', 'in', (self.website_id.id, False))]])

    def _get_trigger_domain(self):
        res = super()._get_trigger_domain()
        # Replace `sale_ok` leaf with `ecommerce_ok` if order is linked to a website
        if self.website_id:
            for idx, leaf in enumerate(res):
                if leaf[0] != 'program_id.sale_ok':
                    continue
                res[idx] = ('program_id.ecommerce_ok', '=', True)
                break
        return expression.AND([res, [('program_id.website_id', 'in', (self.website_id.id, False))]])

    def _try_pending_coupon(self):
        if not request:
            return False

        pending_coupon_code = request.session.get('pending_coupon_code')
        if pending_coupon_code:
            status = self._try_apply_code(pending_coupon_code)
            if 'error' not in status: # Returns an array if everything went right
                request.session.pop('pending_coupon_code')
                if len(status) == 1:
                    coupon, rewards = next(iter(status.items()))
                    if len(rewards) == 1 and not rewards.multi_product:
                        self._apply_program_reward(rewards, coupon)
            return status
        return True

    def _update_programs_and_rewards(self):
        for order in self:
            order._try_pending_coupon()
        return super()._update_programs_and_rewards()

    def _auto_apply_rewards(self):
        """
        Tries to auto apply claimable rewards.

        It must answer to the following rules:
         - Must not be from a nominative program
         - The reward must be the only reward of the program
         - The reward may not be a multi product reward

        Returns True if any reward was claimed else False
        """
        self.ensure_one()

        claimed_reward_count = 0
        claimable_rewards = self._get_claimable_rewards()
        for coupon, rewards in claimable_rewards.items():
            if (
                len(coupon.program_id.reward_ids) != 1
                or coupon.program_id.is_nominative
                or (rewards.reward_type == 'product' and rewards.multi_product)
                or rewards in self.disabled_auto_rewards
                or rewards in self.order_line.reward_id
            ):
                continue

            try:
                res = self._apply_program_reward(rewards, coupon)
                if 'error' not in res:
                    claimed_reward_count += 1
            except UserError:
                pass

        return bool(claimed_reward_count)

    def _compute_website_order_line(self):
        """ This method will merge multiple discount lines generated by a same program
            into a single one (temporary line with `new()`).
            This case will only occur when the program is a discount applied on multiple
            products with different taxes.
            In this case, each taxes will have their own discount line. This is required
            to have correct amount of taxes according to the discount.
            But we wan't these lines to be `visually` merged into a single one in the
            e-commerce since the end user should only see one discount line.
            This is only possible since we don't show taxes in cart.
            eg:
                line 1: 10% discount on product with tax `A` - $15
                line 2: 10% discount on product with tax `B` - $11.5
                line 3: 10% discount on product with tax `C` - $10
            would be `hidden` and `replaced` by
                line 1: 10% discount - $36.5

            Note: The line will be created without tax(es) and the amount will be computed
                  depending if B2B or B2C is enabled.
        """
        super()._compute_website_order_line()
        for order in self:
            grouped_order_lines = defaultdict(lambda: self.env['sale.order.line'])
            for line in order.order_line:
                if line.reward_id and line.coupon_id:
                    grouped_order_lines[(line.reward_id, line.coupon_id, line.reward_identifier_code)] |= line
            new_lines = self.env['sale.order.line']
            for lines in grouped_order_lines.values():
                if lines.reward_id.reward_type != 'discount':
                    continue
                new_lines += self.env['sale.order.line'].new({
                    'product_id': lines[0].product_id.id,
                    'tax_id': False,
                    'price_unit': sum(lines.mapped('price_unit')),
                    'price_subtotal': sum(lines.mapped('price_subtotal')),
                    'price_total': sum(lines.mapped('price_total')),
                    'discount': 0.0,
                    'name': lines[0].name_short if lines.reward_id.reward_type != 'product' else lines[0].name,
                    'product_uom_qty': 1,
                    'product_uom': lines[0].product_uom.id,
                    'order_id': order.id,
                    'is_reward_line': True,
                    'coupon_id': lines.coupon_id,
                    'reward_id': lines.reward_id,
                })
            if new_lines:
                order.website_order_line += new_lines

    def _compute_cart_info(self):
        super(SaleOrder, self)._compute_cart_info()
        for order in self:
            reward_lines = order.website_order_line.filtered(lambda line: line.is_reward_line)
            order.cart_quantity -= int(sum(reward_lines.mapped('product_uom_qty')))

    def get_promo_code_error(self, delete=True):
        error = request.session.get('error_promo_code')
        if error and delete:
            request.session.pop('error_promo_code')
        return error

    def get_promo_code_success_message(self, delete=True):
        if not request.session.get('successful_code'):
            return False
        code = request.session.get('successful_code')
        if delete:
            request.session.pop('successful_code')
        return code

    def _cart_update(self, *args, **kwargs):
        res = super(SaleOrder, self)._cart_update(*args, **kwargs)
        self._update_programs_and_rewards()
        self._auto_apply_rewards()
        return res

    def _get_free_shipping_lines(self):
        self.ensure_one()
        return self.order_line.filtered(lambda l: l.reward_id.reward_type == 'shipping')

    def _allow_nominative_programs(self):
        if not request or not hasattr(request, 'website'):
            return super()._allow_nominative_programs()
        return not request.website.is_public_user() and super()._allow_nominative_programs()

    @api.autovacuum
    def _gc_abandoned_coupons(self, *args, **kwargs):
        """Remove coupons from abandonned ecommerce order."""
        ICP = self.env['ir.config_parameter']
        validity = ICP.get_param('website_sale_coupon.abandonned_coupon_validity', 4)
        validity = fields.Datetime.to_string(fields.datetime.now() - timedelta(days=int(validity)))
        so_to_reset = self.env['sale.order'].search([
            ('state', '=', 'draft'),
            ('write_date', '<', validity),
            ('website_id', '!=', False),
            ('applied_coupon_ids', '!=', False),
        ])
        so_to_reset.applied_coupon_ids = False
        for so in so_to_reset:
            so._update_programs_and_rewards()

    def _get_claimable_and_showable_rewards(self):
        self.ensure_one()
        res = self._get_claimable_rewards()
        loyality_cards = self.env['loyalty.card'].search([
            ('partner_id', '=', self.partner_id.id),
            ('program_id.website_id', 'in', [False, self.website_id.id]),
            ('program_id.company_id', 'in', [False, self.company_id.id]),
            '|',
                ('program_id.trigger', '=', 'with_code'),
                '&', ('program_id.trigger', '=', 'auto'), ('program_id.applies_on', '=', 'future'),
        ])
        total_is_zero = float_is_zero(self.amount_total, precision_digits=2)
        global_discount_reward = self._get_applied_global_discount()
        for coupon in loyality_cards:
            points = self._get_real_points_for_coupon(coupon)
            for reward in coupon.program_id.reward_ids:
                if reward.is_global_discount and global_discount_reward and global_discount_reward.discount >= reward.discount:
                    continue
                if reward.reward_type == 'discount' and total_is_zero:
                    continue
                if coupon.expiration_date and coupon.expiration_date < fields.Date.today():
                    continue
                if points >= reward.required_points:
                    if coupon in res:
                        res[coupon] |= reward
                    else:
                        res[coupon] = reward
        return res
