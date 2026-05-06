# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields, api, Command


class AccountPaymentRegister(models.TransientModel):
    _inherit = 'account.payment.register'

    @api.depends('can_edit_wizard', 'source_amount', 'source_amount_currency', 'source_currency_id', 'company_id', 'currency_id', 'payment_date', 'installments_mode', 'l10n_latam_move_check_ids.amount', 'l10n_latam_new_check_ids.amount', 'payment_method_code')
    def _compute_amount(self):
        # EXTENDS 'l10n_account_withholding_tax'
        super()._compute_amount()
        for wizard in self:
            if wizard.company_id.account_fiscal_country_id.code != 'AR' or wizard.partner_type != 'supplier':
                continue
            checks = wizard.l10n_latam_new_check_ids if wizard._is_latam_check_payment(check_subtype='new_check') else wizard.l10n_latam_move_check_ids
            checks_amount = sum(checks.mapped('amount'))
            if wizard.currency_id.is_zero(checks_amount):
                continue
            if wizard.currency_id.compare_amounts(checks_amount, wizard.withholding_net_amount) == 0:
                continue
            new_amount = wizard._l10n_ar_solve_amount_for_target_net(checks_amount)
            if new_amount is not None and new_amount > 0:
                # `Field.__set__` short-circuits to a low-level write (no `modified()` call,
                # no recomputation) when the record is in `env._protected[field]` — which
                # `wizard` is here, since we're inside `_compute_amount` for `amount`. Going
                # through `BaseModel.write` instead invalidates dependents (`line.base_amount`
                # → `line.amount` → `withholding_net_amount` → alerts) the way a normal write
                # would.
                wizard.write({'amount': wizard.currency_id.round(new_amount)})
                wizard.amount = wizard.currency_id.round(new_amount)
                # Closed-form math is exact, but the per-line ARS→line-currency conversion
                # introduces sub-cent rounding that can leave net off by one rounding unit.
                # A single Banach polish step (`x ← target + Σᵢ Wᵢ(x)`) absorbs that residual.
                if not wizard.currency_id.is_zero(wizard.withholding_net_amount - checks_amount):
                    polished = wizard.currency_id.round(
                        checks_amount + (wizard.amount - wizard.withholding_net_amount)
                    )
                    if polished != wizard.amount:
                        wizard.write({'amount': polished})

    @api.depends('country_code', 'can_edit_wizard', 'can_group_payments', 'group_payment',
                 'amount', 'l10n_latam_move_check_ids.amount', 'l10n_latam_new_check_ids.amount',
                 'payment_method_code', 'withholding_net_amount')
    def _compute_alerts(self):
        # EXTENDS 'l10n_account_withholding_tax'
        super()._compute_alerts()
        for wizard in self:
            if wizard.country_code != 'AR':
                continue
            alerts = dict(wizard.alerts or {})
            # AR withholdings can't be used when paying invoices of different partners (or same partner without grouping)
            if not (wizard.can_edit_wizard and (not wizard.can_group_payments or wizard.group_payment)):
                alerts['l10n_ar_withholding_grouping'] = {
                    'message': self.env._("You can't register withholdings when paying invoices of different partners or same partner without grouping."),
                    'level': 'info',
                }
            # Check amount adjustment mismatch warning
            checks = wizard.l10n_latam_new_check_ids if wizard._is_latam_check_payment(check_subtype='new_check') else wizard.l10n_latam_move_check_ids
            checks_amount = sum(checks.mapped('amount'))
            if not wizard.currency_id.is_zero(checks_amount) and wizard.currency_id.compare_amounts(checks_amount, wizard.withholding_net_amount) != 0:
                alerts['l10n_ar_check_adjustment'] = {
                    'message': self.env._("Adjust total amount or withholdings amount so that the check amount is the correct one."),
                    'level': 'warning',
                }
            wizard.alerts = alerts

    @api.depends('partner_id', 'payment_date')
    def _compute_withholding_line_ids(self):
        # EXTENDS 'l10n_account_withholding_tax'
        ar_wizards = self.filtered(lambda w: w.company_id.country_code == 'AR')
        super(AccountPaymentRegister, self - ar_wizards)._compute_withholding_line_ids()
        for wizard in ar_wizards:
            if not wizard.display_withholding or not wizard.can_edit_wizard:
                wizard.withholding_line_ids = [Command.clear()]
                continue
            if wizard.withholding_line_ids:
                continue
            date = wizard.payment_date or fields.Date.context_today(self)
            partner_type_to_tax_use = {'supplier': 'purchase', 'customer': 'sale'}
            partner_taxes = self.env['l10n_ar.partner.tax'].search([
                *self.env['l10n_ar.partner.tax']._check_company_domain(wizard.company_id),
                '|', ('from_date', '>=', date), ('from_date', '=', False),
                '|', ('to_date', '<=', date), ('to_date', '=', False),
                ('partner_id', '=', wizard.partner_id.commercial_partner_id.id),
                ('tax_id.is_withholding_tax_on_payment', '=', True),
                ('tax_id.type_tax_use', '=', partner_type_to_tax_use.get(wizard.partner_type, '')),
                ('tax_id.active', '=', True)
            ])
            wizard.withholding_line_ids = [Command.clear()] + [Command.create({'tax_id': x.tax_id.id}) for x in partner_taxes]

    def _l10n_ar_solve_amount_for_target_net(self, target_net):
        """Closed-form inverter for the AR withholding gross-up problem.

        `withholding_net_amount(amount) = amount − Σᵢ Wᵢ(amount)` is piecewise linear in
        `amount`, with break-points at per-tax non-taxable cutoffs, scale-bracket boundaries
        (for `earnings_scale`) and minimum-threshold cross-overs. Sample net at each
        break-point (plus a left-limit just below it to capture min-threshold jumps), then
        linearly interpolate inside the segment containing `target_net`.

        Returns the `wizard.amount` producing `target_net`, or `None` if the wizard is not
        an AR supplier payment.
        """
        self.ensure_one()
        ar_lines = self.withholding_line_ids.filtered(lambda l: l.tax_id and l.tax_id.l10n_ar_tax_type)
        if not ar_lines:
            # No AR-typed lines: total withholding is constant in `wizard.amount`, so the
            # gross-up reduces to a single subtraction.
            return target_net + (self.amount - self.withholding_net_amount)

        payment_date = self.payment_date or fields.Date.context_today(self)
        untaxed = sum(self.line_ids.mapped('move_id.amount_untaxed'))
        total = sum(self.line_ids.mapped('move_id.amount_total'))
        untaxed_ratio = (untaxed / total) if total else 1.0

        contexts = [self._l10n_ar_solver_context(line, untaxed_ratio, payment_date) for line in ar_lines]
        # `target_net` is included to guarantee at least two break-points (and therefore at
        # least one segment) when the line set has no scale / non-taxable / threshold — i.e.
        # a purely linear `Wᵢ(x)` whose `breakpoints` set is empty.
        breakpoints = sorted({0.0, target_net, *(bp for ctx in contexts for bp in ctx['breakpoints'])})

        def eval_net(x):
            return x - sum(self._l10n_ar_solver_evaluate(ctx, x) for ctx in contexts)

        # Sample once at every break-point; capture slope changes and post-jump values.
        bp_samples = [(x, eval_net(x)) for x in breakpoints]

        # Add a left-limit sample just below each break-point so a min-threshold jump shows
        # up as `(x_left, x_right)` with `x_right ≈ x_left` but `net_right < net_left`.
        eps = max(self.currency_id.rounding, 0.01)
        samples = [bp_samples[0]]
        for (x_a, _), (x_b, net_b) in zip(bp_samples, bp_samples[1:]):
            x_left = max(x_a + eps / 2.0, x_b - eps)
            if x_left < x_b:
                samples.append((x_left, eval_net(x_left)))
            samples.append((x_b, net_b))

        for (x_a, net_a), (x_b, net_b) in zip(samples, samples[1:]):
            if net_b < net_a:
                # Min-threshold jump: net drops between x_a and x_b. If `target_net` falls
                # in the gap, no exact solution exists; pick the largest x with `net ≥ target`.
                if net_b <= target_net <= net_a:
                    return x_a
            elif net_a <= target_net <= net_b:
                if net_a == net_b:
                    return x_a
                return x_a + (target_net - net_a) * (x_b - x_a) / (net_b - net_a)

        # Above the last break-point: extrapolate using the slope of the final FULL segment
        # (`bp_samples[-2:]`, not `samples[-2:]`) so we don't pick up the left-limit
        # microsegment whose slope is corrupted by per-cent currency rounding.
        if len(bp_samples) >= 2:
            (x_a, net_a), (x_b, net_b) = bp_samples[-2], bp_samples[-1]
            if x_b > x_a and net_b > net_a:
                return x_b + (target_net - net_b) * (x_b - x_a) / (net_b - net_a)
        return None

    def _l10n_ar_solver_context(self, line, untaxed_ratio, payment_date):
        """Build a per-line context for the closed-form solver: conversion rate to ARS,
        scale brackets, same-period accumulations, and the set of break-points (in
        `wizard.amount`-space) where the line's withholding contribution changes slope or
        jumps.
        """
        self.ensure_one()
        company = self.company_id
        company_curr = company.currency_id
        line_curr = self.currency_id
        tax = line.tax_id

        k = 1.0 if tax.l10n_ar_tax_type == 'iibb_total' else untaxed_ratio
        if line_curr == company_curr:
            r1 = 1.0
        else:
            r1 = self.env['res.currency']._get_conversion_rate(line_curr, company_curr, company, payment_date)

        non_taxable = tax.l10n_ar_non_taxable_amount or 0.0
        threshold = tax.l10n_ar_minimum_threshold or 0.0
        prior_base = prior_wh = 0.0
        if tax.l10n_ar_tax_type in ('earnings', 'earnings_scale'):
            prior_base, prior_wh = line._l10n_ar_get_same_period_amounts()

        if tax.l10n_ar_tax_type == 'earnings_scale':
            scale = sorted(
                ((s.excess_amount, s.to_amount, s.percentage, s.fixed_amount)
                 for s in tax.l10n_ar_scale_id.line_ids),
                key=lambda s: s[0],
            )
        else:
            scale = [(0.0, float('inf'), abs(tax.amount), 0.0)]

        bps = set()
        kr = k * r1
        if kr > 0:
            # Non-taxable cutoff: x such that (k·r1·x) + prior_base = non_taxable
            if non_taxable > prior_base:
                bps.add((non_taxable - prior_base) / kr)
            # Scale-bracket boundaries: x such that (k·r1·x) + prior_base − non_taxable = to_j
            for (e, t, p, f) in scale:
                if t < float('inf'):
                    x_b = (non_taxable - prior_base + t) / kr
                    if x_b > 0:
                        bps.add(x_b)
            # Min-threshold jumps: x such that scale_amount(x) − prior_wh = threshold,
            # solved per bracket. Phantom solutions in non-matching brackets are harmless.
            if threshold > 0:
                for (e, t, p, f) in scale:
                    if p > 0:
                        x_t = ((threshold + prior_wh - f) * 100.0 / p + e + non_taxable - prior_base) / kr
                        if x_t > 0:
                            bps.add(x_t)

        return {
            'line': line,
            'tax': tax,
            'k': k,
            'non_taxable': non_taxable,
            'threshold': threshold,
            'same_period_amounts': (prior_base, prior_wh),
            'breakpoints': bps,
            'company': company,
            'company_curr': company_curr,
            'line_curr': line_curr,
            'payment_date': payment_date,
        }

    def _l10n_ar_solver_evaluate(self, ctx, x):
        """Pure-function evaluation of `line.amount` in the line currency at hypothetical
        `wizard.amount = x`; mirrors `_l10n_ar_compute_withholding_amount` without writing
        any field.
        """
        base_ars = ctx['line_curr']._convert(
            ctx['k'] * x, ctx['company_curr'], ctx['company'], ctx['payment_date'],
        )
        if ctx['tax'].l10n_ar_tax_type in ('earnings', 'earnings_scale'):
            tax_ars = ctx['line']._l10n_ar_compute_earnings_amount(base_ars, same_period_amounts=ctx['same_period_amounts'])
        else:
            net = max(0.0, base_ars - ctx['non_taxable'])
            tax_ars = ctx['company_curr'].round(net * abs(ctx['tax'].amount) / 100.0)
            if ctx['threshold'] > tax_ars:
                tax_ars = 0.0
        return ctx['company_curr']._convert(
            tax_ars, ctx['line_curr'], ctx['company'], ctx['payment_date'],
        )
