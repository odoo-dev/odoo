# -*- coding: utf-8 -*-

from odoo import api, models
from odoo.tools import SQL


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    @api.model
    def _get_query_tax_details_from_domain(self, domain) -> SQL:
        """ Create the tax details sub-query based on the orm domain passed as parameter.

        :param domain:      An orm domain on account.move.line.
        :return:            query as SQL object
        """
        query = self.env['account.move.line']._search(domain)

        return self._get_query_tax_details(query.from_clause, query.where_clause)

    @api.model
    def _get_tax_query_extra_clauses(self) -> tuple[SQL, SQL]:
        #TO OVERRIDE
        return SQL(), SQL()

    @api.model
    def _get_query_tax_details(self, table_references, search_condition):
        """
        Create the tax details sub-query for the given account move lines.

        This query maps tax lines to their corresponding base lines and computes the
        portion of each tax amount attributable to every base line. If a tax line
        matches multiple base lines, the tax amount is distributed proportionally
        according to their signed base amounts.

        Example:

            Move lines:
                Name            Balance     Tax
                ---------------------------------
                base_line_1      100        VAT 10%
                base_line_2      200        VAT 10%
                tax_line         30

            Result:
                base_line_id    tax_line_id    base_amount    tax_amount
                --------------------------------------------------------
                base_line_1     tax_line       100            10
                base_line_2     tax_line       200            20

        Tax lines that affect the base of another tax are first matched as base
        candidates, then dispatched back to their original base lines.
        """
        extra_aml_select_clause, extra_td_where_clause = self._get_tax_query_extra_clauses()
        self.env.cr.execute(SQL("""
            DROP TABLE IF EXISTS filtered_aml_tmp, aml_tax_ids_tmp, base_lines_tmp, tax_lines_tmp;

            -- filter out required AMLs
            CREATE TEMPORARY TABLE filtered_aml_tmp ON COMMIT DROP AS
            SELECT
                account_move_line.id,
                account_move_line.move_id,
                account_move_line.account_id,
                account_move_line.partner_id,
                account_move_line.currency_id,
                account_move_line.company_currency_id,
                account_move_line.balance,
                account_move_line.amount_currency,
                account_move_line.quantity,
                account_move_line.tax_line_id,
                account_move_line.group_tax_id,
                account_move_line.tax_repartition_line_id,
                account_move_line.analytic_distribution
                %(extra_aml_select_clause)s
            FROM %(table_references)s
            WHERE %(search_condition)s;

            CREATE TEMP TABLE aml_tax_ids_tmp ON COMMIT DROP AS
            SELECT
                rel.account_move_line_id AS id,
                ARRAY_AGG(rel.account_tax_id ORDER BY rel.account_tax_id) AS tax_ids
            FROM account_move_line_account_tax_rel rel
            JOIN filtered_aml_tmp f
                ON f.id = rel.account_move_line_id
            GROUP BY rel.account_move_line_id;

            -- filter out base_lines and creates a single join key to keep query estimate simple
            CREATE TEMP TABLE base_lines_tmp ON COMMIT DROP AS
            SELECT f.*, rel.account_tax_id AS applied_tax_id,
                COALESCE(aml_tax_ids.tax_ids, ARRAY[]::integer[]) AS tax_ids,
                f.tax_repartition_line_id IS NOT NULL AS is_tax_line_base,
                (f.move_id::text || ':' || f.currency_id::text || ':' || rel.account_tax_id::text) AS join_key
            FROM filtered_aml_tmp f
            JOIN account_move_line_account_tax_rel rel ON f.id = rel.account_move_line_id
            JOIN aml_tax_ids_tmp aml_tax_ids
                ON aml_tax_ids.id = f.id;

            -- filter out tax_lines and creates a single join key to keep query estimate simple
            CREATE TEMP TABLE tax_lines_tmp ON COMMIT DROP AS
            SELECT f.*, tax_rep.tax_id, tax_rep.account_id AS rep_account_id,
                tax_rep.factor_percent, tax_rep.use_in_tax_closing,
                COALESCE(aml_tax_ids.tax_ids, ARRAY[]::integer[]) AS tax_ids,
                COALESCE(f.group_tax_id, f.tax_line_id) AS effective_tax_id,
                (f.move_id::text || ':' || f.currency_id::text || ':' || COALESCE(f.group_tax_id, f.tax_line_id)::text) AS join_key
            FROM filtered_aml_tmp f
            JOIN account_tax_repartition_line tax_rep ON tax_rep.id = f.tax_repartition_line_id
            LEFT JOIN aml_tax_ids_tmp aml_tax_ids
                ON aml_tax_ids.id = f.id;

            ANALYZE base_lines_tmp;
            ANALYZE tax_lines_tmp;
            ANALYZE filtered_aml_tmp;
            ANALYZE aml_tax_ids_tmp;
            """,
            extra_aml_select_clause=extra_aml_select_clause,
            table_references=table_references,
            search_condition=search_condition,
        ))
        return SQL('''
            WITH matched_tax_data AS (
                SELECT
                    base_line.id AS base_line_id,
                    tax_line.id AS tax_line_id,
                    base_line.balance AS base_amount,
                    tax_line.balance AS total_tax_amount,
                    tax_line.tax_line_id AS tax_id,
                    tax_line.effective_tax_id,
                    tax_line.tax_repartition_line_id,
                    base_line.account_id AS base_account_id,
                    base_line.is_tax_line_base,
                    CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.balance < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE base_line.balance
                    END AS signed_base_balance,
                    comp_curr.decimal_places AS comp_curr_prec,
                    (
                        tax.tax_exigibility != 'on_payment'
                        OR move.tax_cash_basis_rec_id IS NOT NULL
                        OR move.always_tax_exigible
                    ) AS tax_exigible,
                    COALESCE(
                        COALESCE(base_line.partner_id, 0) = COALESCE(tax_line.partner_id, 0)
                        AND (
                            move_type != 'entry'
                            OR (tax.tax_exigibility = 'on_payment' AND tax.cash_basis_transition_account_id IS NOT NULL)
                            OR sign(base_line.balance) = sign(tax_line.balance * tax.amount * factor_percent)
                        ) AND (
                            COALESCE(rep_account_id, base_line.account_id) = tax_line.account_id
                            OR (tax.tax_exigibility = 'on_payment' AND tax.cash_basis_transition_account_id IS NOT NULL)
                        ) AND (
                            (tax.analytic IS NOT TRUE AND use_in_tax_closing IS TRUE)
                            OR (base_line.analytic_distribution IS NULL AND tax_line.analytic_distribution IS NULL)
                            OR base_line.analytic_distribution = tax_line.analytic_distribution
                        ) AND (
                            base_line.is_tax_line_base
                            OR
                            tax.include_base_amount IS NOT TRUE
                            OR
                            tax_line.effective_tax_id != tax_line.tax_id
                            OR tax_line.tax_ids = ARRAY(
                                SELECT base_tax.tax_id
                                FROM UNNEST(base_line.tax_ids) AS base_tax(tax_id)
                                WHERE base_tax.tax_id != tax_line.effective_tax_id
                                ORDER BY base_tax.tax_id
                            )
                        ) %(extra_td_where_clause)s,
                        FALSE
                    ) AS is_matched

                FROM tax_lines_tmp tax_line
                JOIN base_lines_tmp base_line
                  ON (
                    base_line.join_key = tax_line.join_key
                    OR (
                        base_line.is_tax_line_base
                        AND tax_line.group_tax_id IS NOT NULL
                        AND base_line.move_id = tax_line.move_id
                        AND base_line.currency_id = tax_line.currency_id
                        AND base_line.applied_tax_id = tax_line.tax_line_id
                    )
                )
                JOIN account_tax tax
                    ON tax.id = tax_line.tax_line_id
                JOIN account_move move
                    ON move.id = tax_line.move_id
                JOIN res_currency comp_curr
                    ON comp_curr.id = tax_line.company_currency_id
            ),
            direct_matched_tax_data_with_fallback AS (
                /*
                Determine whether each tax line has at least one valid base-line match.

                If not, the query falls back to using all candidate mappings for that tax line,
                providing an approximate mapping instead of returning no result.
                */
                SELECT *,
                    BOOL_OR(is_matched) OVER (PARTITION BY tax_line_id) AS tax_line_has_match
                FROM matched_tax_data
                WHERE NOT is_tax_line_base
            ),
            direct_base_tax_data AS (
                SELECT
                    base_line_id,
                    tax_line_id,
                    base_amount,
                    total_tax_amount,
                    tax_repartition_line_id,
                    tax_id,
                    effective_tax_id,
                    base_account_id,
                    comp_curr_prec,
                    signed_base_balance,
                    tax_exigible
                FROM direct_matched_tax_data_with_fallback
                WHERE is_matched OR NOT tax_line_has_match
            ),
            direct_tax_data AS (
                SELECT
                    *,
                    SUM(signed_base_balance) OVER (PARTITION BY tax_line_id ORDER BY base_line_id) AS cumulated_base_amount,
                    SUM(signed_base_balance) OVER (PARTITION BY tax_line_id) AS total_base_amount
                FROM direct_base_tax_data
            ),
            direct_tax_amounts AS (
                SELECT
                    base_line_id,
                    tax_line_id,
                    base_amount,
                    ROUND(
                        COALESCE(SIGN(cumulated_base_amount) * total_tax_amount * ABS(cumulated_base_amount) / NULLIF(total_base_amount, 0), 0),
                        comp_curr_prec
                    )
                    - LAG(
                        ROUND(
                            COALESCE(SIGN(cumulated_base_amount) * total_tax_amount * ABS(cumulated_base_amount) / NULLIF(total_base_amount, 0), 0),
                            comp_curr_prec
                        ), 1, 0
                    ) OVER (
                        PARTITION BY tax_line_id
                        ORDER BY base_line_id
                    ) AS tax_amount,
                    tax_id,
                    effective_tax_id,
                    tax_repartition_line_id,
                    base_account_id,
                    tax_exigible
                FROM direct_tax_data
            ),
            cascade_base_tax_data AS (
                SELECT
                    source_tax.base_line_id,
                    target_tax.tax_line_id,
                    source_tax.tax_amount AS base_amount,
                    target_tax.total_tax_amount,
                    target_tax.tax_repartition_line_id,
                    target_tax.tax_id,
                    target_tax.effective_tax_id,
                    source_tax.base_account_id,
                    target_tax.comp_curr_prec,
                    source_tax.tax_amount AS signed_base_balance,
                    target_tax.tax_exigible
                FROM matched_tax_data target_tax
                JOIN direct_tax_amounts source_tax
                    ON source_tax.tax_line_id = target_tax.base_line_id
                JOIN direct_base_tax_data target_base_tax
                    ON target_base_tax.tax_line_id = target_tax.tax_line_id
                    AND target_base_tax.base_line_id = source_tax.base_line_id
                JOIN account_move_line_account_tax_rel source_target_tax_rel
                    ON source_target_tax_rel.account_move_line_id = target_tax.base_line_id
                    AND source_target_tax_rel.account_tax_id = target_tax.tax_id
                WHERE target_tax.is_tax_line_base
                  AND target_tax.is_matched
            ),
            all_base_tax_data AS (
                SELECT * FROM direct_base_tax_data
                UNION ALL
                SELECT * FROM cascade_base_tax_data
            ),
            resolved_tax_data AS (
                SELECT
                    *,
                    SUM(signed_base_balance) OVER (PARTITION BY tax_line_id ORDER BY base_line_id, base_amount) AS cumulated_base_amount,
                    SUM(signed_base_balance) OVER (PARTITION BY tax_line_id) AS total_base_amount
                FROM all_base_tax_data
            )
            SELECT
                base_line_id,
                tax_line_id,
                base_amount,
                ROUND(
                    COALESCE(SIGN(cumulated_base_amount) * total_tax_amount * ABS(cumulated_base_amount) / NULLIF(total_base_amount, 0), 0),
                    comp_curr_prec
                )
                - LAG(
                    ROUND(
                        COALESCE(SIGN(cumulated_base_amount) * total_tax_amount * ABS(cumulated_base_amount) / NULLIF(total_base_amount, 0), 0),
                        comp_curr_prec
                    ), 1, 0
                ) OVER (
                    PARTITION BY tax_line_id
                    ORDER BY base_line_id
                ) AS tax_amount,
                tax_id,
                effective_tax_id,
                tax_repartition_line_id,
                base_account_id,
                tax_exigible
            FROM resolved_tax_data
            ORDER BY tax_line_id, base_line_id
            ''',
            extra_td_where_clause=extra_td_where_clause,
        )
