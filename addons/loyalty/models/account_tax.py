from odoo import api, models


class AccountTax(models.Model):
    _inherit = "account.tax"

    # -------------------------------------------------------------------------
    # HELPERS IN BOTH PYTHON/JAVASCRIPT (account_tax.js / account_tax.py)
    # -------------------------------------------------------------------------

    # -------------------------------------------------------------------------
    # DISCOUNT
    # -------------------------------------------------------------------------

    @api.model
    def _prepare_loyalty_reward_lines_per_point(
        self,
        base_lines,
        company,
        points,
        discount_per_point,
        computation_key='loyalty_reward_per_point',
        grouping_function=None,
        exclude_function=None,
        max_discount=None,
        is_payment_program=False,
    ):
        def target_amount_function(total_amount):
            discount_amount = discount_per_point * points
            return -discount_amount

        if is_payment_program:
            eligible_base_lines = self._prepare_base_lines_for_down_payment(
                base_lines=base_lines,
                company=company,
                exclude_function=exclude_function,
            )
        else:
            eligible_base_lines = self._prepare_base_lines_for_discount(
                base_lines=base_lines,
                company=company,
                exclude_function=exclude_function,
            )

        results = self._prepare_sub_lines_for_partial_total_amount(
            base_lines=base_lines,
            eligible_base_lines=eligible_base_lines,
            company=company,
            target_amount_function=target_amount_function,
            computation_key=computation_key,
            grouping_function=grouping_function,
            max_discount=max_discount,
        )

        # Compute the number of consumed points.
        if not results['discount_base_lines']:
            consumed_points = 0.0
        elif max_discount is None:
            consumed_points = points
        else:
            consumed_points = points * abs(results['raw_total_discount']) / abs(results['total_amount'])
        results['consumed_points'] = consumed_points

        return results

    @api.model
    def _prepare_loyalty_reward_lines_per_order(
        self,
        base_lines,
        company,
        discount_amount,
        computation_key='loyalty_reward_per_order',
        grouping_function=None,
        exclude_function=None,
        max_discount=None,
    ):
        def target_amount_function(total_amount):
            return -discount_amount

        discountable_base_lines = self._prepare_base_lines_for_discount(
            base_lines=base_lines,
            company=company,
            exclude_function=exclude_function,
        )
        return self._prepare_sub_lines_for_partial_total_amount(
            base_lines=base_lines,
            eligible_base_lines=discountable_base_lines,
            company=company,
            target_amount_function=target_amount_function,
            computation_key=computation_key,
            grouping_function=grouping_function,
            max_discount=max_discount,
        )

    @api.model
    def _prepare_loyalty_reward_lines_percent(
        self,
        base_lines,
        company,
        percentage,
        computation_key='loyalty_reward_percentage',
        grouping_function=None,
        exclude_function=None,
        max_discount=None,
    ):
        def target_amount_function(total_amount):
            return total_amount * -percentage

        discountable_base_lines = self._prepare_base_lines_for_discount(
            base_lines=base_lines,
            company=company,
            exclude_function=exclude_function,
        )
        return self._prepare_sub_lines_for_partial_total_amount(
            base_lines=base_lines,
            eligible_base_lines=discountable_base_lines,
            company=company,
            target_amount_function=target_amount_function,
            computation_key=computation_key,
            grouping_function=grouping_function,
            max_discount=max_discount,
        )
