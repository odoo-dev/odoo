# -*- coding: utf-8 -*-

from odoo import api, models
from odoo.tools import SQL


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    @api.model
    def _get_extra_query_base_tax_line_mapping(self) -> SQL:
        # TO OVERRIDE
        return SQL()

    def _get_query_tax_details_simplified(self, table_references, search_condition):
        extra_query_base_tax_line_mapping = self._get_extra_query_base_tax_line_mapping()

        return SQL('''
            WITH filtered_aml AS MATERIALIZED (
                SELECT account_move_line.*
                FROM %(table_references)s
                WHERE %(search_condition)s
            ),
            tax_data AS (
                SELECT
                    account_move_line.id AS tax_line_id,
                    t.id AS tax_id,
                    account_move_line.balance AS tax_amount,
                    account_move_line.amount_currency AS tax_amount_currency,
                    base_line.id AS base_line_id,
                    account_move_line.move_id,
                    account_move_line.display_type,
                    account_move_line.group_tax_id,
                    account_move_line.tax_repartition_line_id,
                    base_line.account_id AS base_account_id,
                    t.sequence,
                    CASE WHEN t.amount_type <> 'fixed' THEN base_line.balance ELSE base_line.quantity END AS base_value,
                    base_line.balance AS base_amount,
                    CASE WHEN t.amount_type <> 'fixed' THEN base_line.amount_currency ELSE base_line.quantity END AS base_value_currency,
                    base_line.amount_currency AS base_amount_currency,
                    curr.decimal_places AS curr_prec,
                    comp_curr.decimal_places AS comp_curr_prec,
                    (
                        t.tax_exigibility != 'on_payment'
                        OR move.tax_cash_basis_rec_id IS NOT NULL
                        OR move.always_tax_exigible
                    ) AS tax_exigible
                FROM filtered_aml base_line
                JOIN account_move move ON move.id = base_line.move_id
                JOIN account_move_line_account_tax_rel rel ON rel.account_move_line_id = base_line.id
                JOIN filtered_aml account_move_line
                    ON (
                        COALESCE(account_move_line.group_tax_id, account_move_line.tax_line_id) = rel.account_tax_id
                        OR (
                            base_line.tax_repartition_line_id IS NOT NULL
                            AND account_move_line.tax_line_id = rel.account_tax_id
                        )
                    )
                    AND account_move_line.move_id = base_line.move_id
                    AND account_move_line.currency_id = base_line.currency_id
                    AND account_move_line.partner_id IS NOT DISTINCT FROM base_line.partner_id
                JOIN account_tax t ON t.id = account_move_line.tax_line_id
                JOIN account_tax_repartition_line tax_rep ON tax_rep.id = account_move_line.tax_repartition_line_id
                JOIN res_currency curr ON curr.id = account_move_line.currency_id
                JOIN res_currency comp_curr ON comp_curr.id = account_move_line.company_currency_id
                WHERE (
                        move.move_type != 'entry'
                    OR (t.tax_exigibility = 'on_payment' AND t.cash_basis_transition_account_id IS NOT NULL)
                    OR sign(base_line.balance) = sign(account_move_line.balance * t.amount * tax_rep.factor_percent)
                ) AND (
                    tax_rep.account_id IS NOT NULL
                    OR base_line.account_id = account_move_line.account_id
                ) AND (
                    NOT t.is_base_affected
                    OR NOT t.include_base_amount
                    OR (
                        SELECT base_taxes.tax_ids[
                            ARRAY_LENGTH(base_taxes.tax_ids, 1) - COALESCE(ARRAY_LENGTH(tax_line_taxes.tax_ids, 1), 0):ARRAY_LENGTH(base_taxes.tax_ids, 1)
                        ] = ARRAY[account_move_line.tax_line_id] || tax_line_taxes.tax_ids
                        FROM (
                            SELECT ARRAY(
                                SELECT COALESCE(child_tax.id, tax.id)
                                FROM account_move_line_account_tax_rel base_rel
                                JOIN account_tax tax ON tax.id = base_rel.account_tax_id
                                LEFT JOIN account_tax_filiation_rel tax_filiation
                                    ON tax_filiation.parent_tax = tax.id
                                LEFT JOIN account_tax child_tax ON child_tax.id = tax_filiation.child_tax
                                WHERE base_rel.account_move_line_id = base_line.id
                                ORDER BY tax.sequence, tax.id, child_tax.sequence, child_tax.id
                            ) AS tax_ids
                        ) base_taxes,
                        (
                            SELECT ARRAY(
                                SELECT tax_rel.account_tax_id
                                FROM account_move_line_account_tax_rel tax_rel
                                JOIN account_tax tax ON tax.id = tax_rel.account_tax_id
                                WHERE tax_rel.account_move_line_id = account_move_line.id
                                ORDER BY tax.sequence, tax.id
                            ) AS tax_ids
                        ) tax_line_taxes
                    )
                ) AND (
                    (t.analytic IS NOT TRUE AND tax_rep.use_in_tax_closing IS TRUE)
                    OR (base_line.analytic_distribution IS NULL AND account_move_line.analytic_distribution IS NULL)
                    OR base_line.analytic_distribution = account_move_line.analytic_distribution
                )
                %(extra_query_base_tax_line_mapping)s
            ),
            aggregated AS (
                SELECT
                    *,
                    SUM(base_value) OVER (
                        PARTITION BY tax_line_id, tax_id
                        ORDER BY sequence, base_line_id
                    ) AS base_cumul,
                    SUM(base_value) OVER (PARTITION BY tax_line_id, tax_id) AS base,
                    SUM(base_value_currency) OVER (
                        PARTITION BY tax_line_id, tax_id
                        ORDER BY sequence, base_line_id
                    ) AS base_cumul_currency,
                    SUM(base_value_currency) OVER (PARTITION BY tax_line_id, tax_id) AS base_currency
                FROM tax_data
            )
            SELECT
                tax_line_id || '-' || base_line_id AS id,
                base_line_id,
                tax_line_id,
                display_type,
                tax_id,
                group_tax_id,
                tax_exigible,
                base_account_id,
                tax_repartition_line_id,
                base_amount,
                COALESCE(
                    ROUND(tax_amount * base_cumul / NULLIF(base, 0), comp_curr_prec)
                    - LAG(ROUND(tax_amount * base_cumul / NULLIF(base, 0), comp_curr_prec), 1, 0.0)
                        OVER (PARTITION BY tax_line_id, tax_id ORDER BY tax_line_id, base_line_id),
                    0.0
                ) AS tax_amount,
                base_amount_currency,
                COALESCE(
                    ROUND(tax_amount_currency * base_cumul_currency / NULLIF(base_currency, 0), curr_prec)
                    - LAG(ROUND(tax_amount_currency * base_cumul_currency / NULLIF(base_currency, 0), curr_prec), 1, 0.0)
                        OVER (PARTITION BY tax_line_id, tax_id ORDER BY tax_line_id, base_line_id),
                    0.0
                ) AS tax_amount_currency
            FROM aggregated
            ORDER BY tax_line_id, base_line_id
            ''',
            table_references=table_references,
            search_condition=search_condition,
            extra_query_base_tax_line_mapping=extra_query_base_tax_line_mapping,
        )

    @api.model
    def _get_query_tax_details(self, table_references, search_condition) -> SQL:
        """Create the tax details sub-query based on an existing SQL query.

        Kept as a compatibility wrapper for callers already building their own
        account.move.line query.
        """
        return self._get_query_tax_details_simplified(table_references, search_condition)

    @api.model
    def _get_query_tax_details_from_domain(self, domain, fallback=False) -> SQL:
        """Create the tax details sub-query based on the orm domain passed as parameter.

        The simplified query is always used; ``fallback`` is kept for compatibility.
        """
        query = self.env['account.move.line']._search(domain)
        return self._get_query_tax_details_simplified(query.from_clause, query.where_clause)
