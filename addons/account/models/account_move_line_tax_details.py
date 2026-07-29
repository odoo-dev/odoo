# -*- coding: utf-8 -*-

from collections import defaultdict

from odoo import api, models
from odoo.tools import SQL


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _get_query_tax_details_simplified(self, table_references, search_condition):
        return SQL('''
            WITH filtered_aml AS MATERIALIZED (
                SELECT account_move_line.*, move.move_type AS move_type
                FROM %(table_references)s
                JOIN account_move move ON move.id = account_move_line.move_id
                WHERE %(search_condition)s
            ),
            base_lines AS (
                SELECT f.*, rel.account_tax_id AS applied_tax_id
                FROM filtered_aml f
                JOIN account_move_line_account_tax_rel rel ON f.id = rel.account_move_line_id
                WHERE f.tax_repartition_line_id IS NULL
                OR EXISTS (
                    SELECT 1
                    FROM account_move_line_account_tax_rel tax_line_rel
                    WHERE tax_line_rel.account_move_line_id = f.id
                )
            ),
            tax_lines AS (
                SELECT
                    f.*,
                    tax_rep.tax_id,
                    tax_rep.account_id AS rep_account_id,
                    tax_rep.factor_percent AS factor_percent,
                    tax_rep.use_in_tax_closing AS use_in_tax_closing,
                    COALESCE(f.group_tax_id, f.tax_line_id) AS effective_tax_id
                FROM filtered_aml f
                JOIN account_tax_repartition_line tax_rep ON tax_rep.id = f.tax_repartition_line_id
            ),
            tax_data AS (
                SELECT
                    lt.id AS tax_line_id, lt.balance AS tax_amount,
                    lt.amount_currency AS tax_amount_currency,
                    aml.id AS base_line_id, aml.move_id,
                    lt.display_type,
                    lt.tax_line_id AS tax_id,
                    lt.group_tax_id,
                    lt.tax_repartition_line_id,
                    lt.account_id AS tax_account_id,
                    aml.account_id AS base_account_id,
                    t.sequence,
                    CASE WHEN t.amount_type <> 'fixed' THEN aml.balance ELSE aml.quantity END AS base_value,
                    aml.balance AS base_amount,
                    CASE WHEN t.amount_type <> 'fixed' THEN aml.amount_currency ELSE aml.quantity END AS base_value_currency,
                    aml.amount_currency AS base_amount_currency,
                    curr.decimal_places AS curr_prec,
                    comp_curr.decimal_places AS comp_curr_prec,
                    (
                        t.tax_exigibility != 'on_payment'
                        OR move.tax_cash_basis_rec_id IS NOT NULL
                        OR move.always_tax_exigible
                    ) AS tax_exigible
                FROM base_lines aml
                JOIN account_move move ON move.id = aml.move_id
                JOIN tax_lines lt
                ON lt.move_id = aml.move_id
                AND lt.currency_id = aml.currency_id
                AND lt.partner_id IS NOT DISTINCT FROM aml.partner_id
                AND (
                    (
                        aml.tax_repartition_line_id IS NULL
                        AND lt.effective_tax_id = aml.applied_tax_id
                    )
                    OR (
                        aml.tax_repartition_line_id IS NOT NULL
                        AND lt.tax_line_id = aml.applied_tax_id
                        AND lt.group_tax_id IS NOT DISTINCT FROM aml.group_tax_id
                    )
                )
                JOIN account_tax t ON aml.applied_tax_id = t.id
                JOIN res_currency curr ON curr.id = lt.currency_id
                JOIN res_currency comp_curr ON comp_curr.id = lt.company_currency_id
                WHERE (
                    aml.move_type != 'entry'
                    OR (t.tax_exigibility = 'on_payment' AND t.cash_basis_transition_account_id IS NOT NULL)
                    OR sign(aml.balance) = sign(lt.balance * t.amount * lt.factor_percent)
                ) AND (
                    COALESCE(rep_account_id, aml.account_id) = lt.account_id
                    OR (t.tax_exigibility = 'on_payment' AND t.cash_basis_transition_account_id IS NOT NULL)
                ) AND (
                    (t.analytic IS NOT TRUE AND use_in_tax_closing IS TRUE)
                    OR (aml.analytic_distribution IS NULL AND lt.analytic_distribution IS NULL)
                    OR aml.analytic_distribution = lt.analytic_distribution
                )
            )
            SELECT
                tax_line_id || '-' || base_line_id || '-' || base_line_id AS id,
                move_id,
                tax_line_id,
                base_line_id,
                base_line_id AS src_line_id,
                display_type,
                tax_id,
                group_tax_id,
                tax_exigible,
                base_account_id,
                tax_repartition_line_id,
                base_amount,
                tax_amount,
                base_amount_currency,
                tax_amount_currency,
                base_value,
                base_value_currency,
                sequence
            FROM tax_data
            ORDER BY tax_line_id, base_line_id;
            ''',
            table_references=table_references,
            search_condition=search_condition,
        )

    def _postprocess_tax_details_simplified(self, tax_details):
        if not tax_details:
            return []

        line_ids = {tax_detail['base_line_id'] for tax_detail in tax_details} | {tax_detail['tax_line_id'] for tax_detail in tax_details}
        lines = self.browse(line_ids).exists()
        lines_by_id = {line.id: line for line in lines}
        tax_ids = {tax_detail['tax_id'] for tax_detail in tax_details}
        taxes_by_id = {tax.id: tax for tax in self.env['account.tax'].browse(tax_ids).exists()}
        context_tax_ids = set(tax_ids)
        for line in lines:
            context_tax_ids.update(line.tax_ids.ids)
        parent_tax_ids_by_child = defaultdict(set)
        for parent_tax in self.env['account.tax'].search([('children_tax_ids', 'in', list(context_tax_ids))]):
            for child_tax in parent_tax.children_tax_ids:
                parent_tax_ids_by_child[child_tax.id].add(parent_tax.id)

        tax_details_by_base_tax = defaultdict(list)
        for tax_detail in tax_details:
            tax_details_by_base_tax[(tax_detail['base_line_id'], tax_detail['tax_id'])].append(tax_detail)

        tax_details = []
        for (base_line_id, tax_id), candidate_details in tax_details_by_base_tax.items():
            base_line = lines_by_id[base_line_id]
            context_candidates = [
                tax_detail
                for tax_detail in candidate_details
                if lines_by_id[tax_detail['tax_line_id']].tax_ids
            ]
            if not context_candidates:
                tax_details.extend(candidate_details)
                continue

            base_context_tax_ids = set(base_line.tax_ids.ids)
            for tax in base_line.tax_ids:
                base_context_tax_ids.update(tax.children_tax_ids.ids)
            base_context_tax_ids.discard(tax_id)
            for parent_tax_id in parent_tax_ids_by_child[tax_id]:
                base_context_tax_ids.discard(parent_tax_id)

            matching_candidates = []
            for tax_detail in context_candidates:
                tax_line = lines_by_id[tax_detail['tax_line_id']]
                tax_line_context_tax_ids = set(tax_line.tax_ids.ids)
                for tax in tax_line.tax_ids:
                    tax_line_context_tax_ids.update(parent_tax_ids_by_child[tax.id])
                if tax_line_context_tax_ids.issubset(base_context_tax_ids):
                    matching_candidates.append(tax_detail)

            if matching_candidates:
                tax_details.append(max(
                    matching_candidates,
                    key=lambda tax_detail: (
                        len(lines_by_id[tax_detail['tax_line_id']].tax_ids),
                        -lines_by_id[tax_detail['tax_line_id']].id,
                    ),
                ))
            else:
                tax_details.append(min(
                    candidate_details,
                    key=lambda tax_detail: (
                        bool(lines_by_id[tax_detail['tax_line_id']].tax_ids),
                        lines_by_id[tax_detail['tax_line_id']].id,
                    ),
                ))

        raw_tax_details_by_tax_line = defaultdict(list)
        for tax_detail in tax_details:
            raw_tax_details_by_tax_line[(tax_detail['tax_line_id'], tax_detail['tax_id'])].append(tax_detail)

        tax_details = []
        for (tax_line_id, _tax_id), raw_tax_details in raw_tax_details_by_tax_line.items():
            tax_line = lines_by_id[tax_line_id]
            company_currency = tax_line.company_currency_id
            currency = tax_line.currency_id
            total_base_value = sum(tax_detail['base_value'] for tax_detail in raw_tax_details)
            total_base_value_currency = sum(tax_detail['base_value_currency'] for tax_detail in raw_tax_details)
            total_tax_amount = raw_tax_details[0]['tax_amount']
            total_tax_amount_currency = raw_tax_details[0]['tax_amount_currency']
            cumulated_base_value = 0.0
            cumulated_base_value_currency = 0.0
            cumulated_tax_amount = 0.0
            cumulated_tax_amount_currency = 0.0

            for tax_detail in sorted(raw_tax_details, key=lambda tax_detail: (tax_detail['sequence'], tax_detail['base_line_id'])):
                cumulated_base_value += tax_detail['base_value']
                cumulated_base_value_currency += tax_detail['base_value_currency']
                new_cumulated_tax_amount = company_currency.round(
                    total_tax_amount * cumulated_base_value / total_base_value
                ) if total_base_value else 0.0
                new_cumulated_tax_amount_currency = currency.round(
                    total_tax_amount_currency * cumulated_base_value_currency / total_base_value_currency
                ) if total_base_value_currency else 0.0
                tax_details.append({
                    **tax_detail,
                    'tax_amount': round(new_cumulated_tax_amount - cumulated_tax_amount, company_currency.decimal_places),
                    'tax_amount_currency': round(new_cumulated_tax_amount_currency - cumulated_tax_amount_currency, currency.decimal_places),
                })
                cumulated_tax_amount = new_cumulated_tax_amount
                cumulated_tax_amount_currency = new_cumulated_tax_amount_currency

        direct_tax_details = []
        tax_line_base_details = []
        for tax_detail in tax_details:
            if lines_by_id[tax_detail['base_line_id']].tax_repartition_line_id:
                tax_line_base_details.append(tax_detail)
            else:
                direct_tax_details.append(tax_detail)

        processed_tax_details = list(direct_tax_details)
        tax_details_by_tax_line = defaultdict(list)
        for tax_detail in processed_tax_details:
            tax_details_by_tax_line[tax_detail['tax_line_id']].append(tax_detail)

        tax_line_base_details.sort(key=lambda tax_detail: (
            lines_by_id[tax_detail['base_line_id']].tax_line_id.sequence,
            lines_by_id[tax_detail['base_line_id']].id,
            lines_by_id[tax_detail['tax_line_id']].tax_line_id.sequence,
            lines_by_id[tax_detail['tax_line_id']].id,
        ))

        for tax_line_base_detail in tax_line_base_details:
            source_details = tax_details_by_tax_line.get(tax_line_base_detail['base_line_id'], [])
            if not source_details:
                continue

            source_details_by_base_line = defaultdict(lambda: {
                'base_amount': 0.0,
                'base_amount_currency': 0.0,
            })
            for source_detail in source_details:
                source_base_detail = source_details_by_base_line[source_detail['base_line_id']]
                source_base_detail['base_amount'] += source_detail['tax_amount']
                source_base_detail['base_amount_currency'] += source_detail['tax_amount_currency']

            cumulated_tax_amount = 0.0
            cumulated_tax_amount_currency = 0.0
            total_base_amount = sum(source_detail['base_amount'] for source_detail in source_details_by_base_line.values())
            total_base_amount_currency = sum(source_detail['base_amount_currency'] for source_detail in source_details_by_base_line.values())
            base_line = lines_by_id[tax_line_base_detail['base_line_id']]
            company_currency = base_line.company_currency_id
            currency = base_line.currency_id

            for base_line_id, source_detail in sorted(source_details_by_base_line.items()):
                new_cumulated_tax_amount = company_currency.round(
                    tax_line_base_detail['tax_amount'] * source_detail['base_amount'] / total_base_amount
                ) if total_base_amount else 0.0
                new_cumulated_tax_amount_currency = currency.round(
                    tax_line_base_detail['tax_amount_currency'] * source_detail['base_amount_currency'] / total_base_amount_currency
                ) if total_base_amount_currency else 0.0
                new_tax_detail = {
                    **tax_line_base_detail,
                    'id': f"{tax_line_base_detail['tax_line_id']}-{base_line_id}-{tax_line_base_detail['base_line_id']}",
                    'base_line_id': base_line_id,
                    'src_line_id': tax_line_base_detail['base_line_id'],
                    'base_amount': source_detail['base_amount'],
                    'tax_amount': round(new_cumulated_tax_amount - cumulated_tax_amount, company_currency.decimal_places),
                    'base_amount_currency': source_detail['base_amount_currency'],
                    'tax_amount_currency': round(new_cumulated_tax_amount_currency - cumulated_tax_amount_currency, currency.decimal_places),
                }
                cumulated_tax_amount = new_cumulated_tax_amount
                cumulated_tax_amount_currency = new_cumulated_tax_amount_currency
                processed_tax_details.append(new_tax_detail)
                tax_details_by_tax_line[new_tax_detail['tax_line_id']].append(new_tax_detail)

        return processed_tax_details

    def _get_query_postprocessed_tax_details_simplified(self, table_references, search_condition):
        self.flush_model()
        self.env.cr.execute(self._get_query_tax_details_simplified(table_references, search_condition))
        tax_details = self.env.cr.dictfetchall()
        tax_details = self._postprocess_tax_details_simplified(tax_details)

        table_name = f"account_move_line_tax_details_simplified_{id(self.env.cr)}"
        self.env.cr.execute(SQL('''
            CREATE TEMPORARY TABLE IF NOT EXISTS %(table_name)s (
                id text,
                base_line_id integer,
                tax_line_id integer,
                display_type varchar,
                src_line_id integer,
                tax_id integer,
                group_tax_id integer,
                tax_exigible boolean,
                base_account_id integer,
                tax_repartition_line_id integer,
                base_amount numeric,
                tax_amount numeric,
                base_amount_currency numeric,
                tax_amount_currency numeric
            ) ON COMMIT DROP
            ''', table_name=SQL.identifier(table_name)))
        self.env.cr.execute(SQL("TRUNCATE %(table_name)s", table_name=SQL.identifier(table_name)))
        if tax_details:
            self.env.cr.execute_values(
                f'''
                    INSERT INTO "{table_name}" (
                        id, base_line_id, tax_line_id, display_type, src_line_id, tax_id, group_tax_id,
                        tax_exigible, base_account_id, tax_repartition_line_id, base_amount, tax_amount,
                        base_amount_currency, tax_amount_currency
                    ) VALUES %s
                    ''',
                [(
                    tax_detail['id'],
                    tax_detail['base_line_id'],
                    tax_detail['tax_line_id'],
                    tax_detail['display_type'],
                    tax_detail['src_line_id'],
                    tax_detail['tax_id'],
                    tax_detail['group_tax_id'],
                    tax_detail['tax_exigible'],
                    tax_detail['base_account_id'],
                    tax_detail['tax_repartition_line_id'],
                    tax_detail['base_amount'],
                    tax_detail['tax_amount'],
                    tax_detail['base_amount_currency'],
                    tax_detail['tax_amount_currency'],
                ) for tax_detail in tax_details],
            )
        return SQL('''
            SELECT *
            FROM %(table_name)s
            ORDER BY base_line_id, ABS(base_amount), ABS(tax_amount), tax_line_id
            ''', table_name=SQL.identifier(table_name))

    @api.model
    def _get_query_tax_details_from_domain(self, domain, fallback=False) -> SQL:
        """ Create the tax details sub-query based on the orm domain passed as parameter.

        :param domain:      An orm domain on account.move.line.
        :param fallback:    Fallback on an approximated mapping if the mapping failed.
        :return:            query as SQL object
        """
        query = self.env['account.move.line']._search(domain)
        if not fallback:
            return self._get_query_postprocessed_tax_details_simplified(query.from_clause, query.where_clause)

        return self._get_query_tax_details(query.from_clause, query.where_clause, fallback=fallback)

    @api.model
    def _get_extra_query_base_tax_line_mapping(self) -> SQL:
        #TO OVERRIDE
        return SQL()

    @api.model
    def _get_query_tax_details(self, table_references, search_condition, fallback=True) -> SQL:
        """ Create the tax details sub-query based on the orm domain passed as parameter.

        :param table_references:    The query to inject after the FROM, as an SQL object.
        :param search_condition:    The query to inject in the WHERE clause, as an SQL object.
        :param fallback:            Fallback on an approximated mapping if the mapping failed.
        :return:                    query as an SQL object
        """
        group_taxes = self.env['account.tax'].search([('amount_type', '=', 'group')])

        group_taxes_query_list = []
        for group_tax in group_taxes:
            children_taxes = group_tax.children_tax_ids
            if not children_taxes:
                continue

            children_taxes_in_query = SQL(','.join('%s' for dummy in children_taxes),
                                          *children_taxes.ids)
            group_taxes_query_list.append(SQL('WHEN tax.id = %s THEN ARRAY[%s]', group_tax.id, children_taxes_in_query))

        if group_taxes_query_list:
            group_taxes_query = SQL('''UNNEST(CASE %s ELSE ARRAY[tax.id] END)''', SQL(' ').join(group_taxes_query_list))
        else:
            group_taxes_query = SQL('tax.id')

        if fallback:
            fallback_query = SQL(
                '''
                UNION ALL

                SELECT
                    account_move_line.id AS tax_line_id,
                    base_line.id AS base_line_id,
                    base_line.id AS src_line_id,
                    base_line.balance AS base_amount,
                    base_line.amount_currency AS base_amount_currency
                FROM %(table_references)s
                LEFT JOIN base_tax_line_mapping ON
                    base_tax_line_mapping.tax_line_id = account_move_line.id
                JOIN account_move_line_account_tax_rel tax_rel ON
                    tax_rel.account_tax_id = COALESCE(account_move_line.group_tax_id, account_move_line.tax_line_id)
                JOIN account_move_line base_line ON
                    base_line.id = tax_rel.account_move_line_id
                    AND base_line.tax_repartition_line_id IS NULL
                    AND base_line.move_id = account_move_line.move_id
                    AND base_line.currency_id = account_move_line.currency_id
                WHERE base_tax_line_mapping.tax_line_id IS NULL
                AND %(search_condition)s
                ''',
                table_references=table_references,
                search_condition=search_condition,
            )
        else:
            fallback_query = SQL()

        extra_query_base_tax_line_mapping = self._get_extra_query_base_tax_line_mapping()

        return SQL(
            '''
            /*
            As example to explain the different parts of the query, we'll consider a move with the following lines:
            Name            Tax_line_id         Tax_ids                 Debit       Credit      Base lines
            ---------------------------------------------------------------------------------------------------
            base_line_1                         10_affect_base, 20      1000
            base_line_2                         10_affect_base, 5       2000
            base_line_3                         10_affect_base, 5       3000
            tax_line_1      10_affect_base      20                                  100         base_line_1
            tax_line_2      20                                                      220         base_line_1
            tax_line_3      10_affect_base      5                                   500         base_line_2/3
            tax_line_4      5                                                       275         base_line_2/3
            */

            WITH base_tax_line_mapping AS (

                /*
                Create the mapping of each tax lines with their corresponding base lines.

                In the example, it will give the following values:
                    base_line_id     tax_line_id    base_amount
                    -------------------------------------------
                    base_line_1      tax_line_1         1000
                    base_line_1      tax_line_2         1000
                    base_line_2      tax_line_3         2000
                    base_line_2      tax_line_4         2000
                    base_line_3      tax_line_3         3000
                    base_line_3      tax_line_4         3000
                */

                SELECT
                    account_move_line.id AS tax_line_id,
                    base_line.id AS base_line_id,
                    base_line.balance AS base_amount,
                    base_line.amount_currency AS base_amount_currency

                FROM %(table_references)s
                JOIN account_tax_repartition_line tax_rep ON
                    tax_rep.id = account_move_line.tax_repartition_line_id
                JOIN account_tax tax ON
                    tax.id = account_move_line.tax_line_id
                JOIN account_move_line_account_tax_rel tax_rel ON
                    tax_rel.account_tax_id = COALESCE(account_move_line.group_tax_id, account_move_line.tax_line_id)
                JOIN account_move move ON
                    move.id = account_move_line.move_id
                JOIN account_move_line base_line ON
                    base_line.id = tax_rel.account_move_line_id
                    AND base_line.tax_repartition_line_id IS NULL
                    AND base_line.move_id = account_move_line.move_id
                    AND (
                        move.move_type != 'entry'
                        OR (tax.tax_exigibility = 'on_payment' AND tax.cash_basis_transition_account_id IS NOT NULL)
                        OR sign(account_move_line.balance) = sign(base_line.balance * tax.amount * tax_rep.factor_percent)
                    )
                    AND COALESCE(base_line.partner_id, 0) = COALESCE(account_move_line.partner_id, 0)
                    AND base_line.currency_id = account_move_line.currency_id
                    AND (
                        COALESCE(tax_rep.account_id, base_line.account_id) = account_move_line.account_id
                        OR (tax.tax_exigibility = 'on_payment' AND tax.cash_basis_transition_account_id IS NOT NULL)
                    )
                    AND (
                        (tax.analytic IS NOT TRUE AND tax_rep.use_in_tax_closing IS TRUE)
                        OR (base_line.analytic_distribution IS NULL AND account_move_line.analytic_distribution IS NULL)
                        OR base_line.analytic_distribution = account_move_line.analytic_distribution
                    )
                    %(extra_query_base_tax_line_mapping)s
                JOIN res_currency curr ON
                    curr.id = account_move_line.currency_id
                JOIN res_currency comp_curr ON
                    comp_curr.id = account_move_line.company_currency_id
                LEFT JOIN LATERAL (
                    /*
                        This table builds a reference table based on the tax_ids field, with the following changes:
                          - flatten the group of taxes
                          - exclude the taxes having 'is_base_affected' set to False.
                        Those allow to match only base_line_1 when finding the base lines of tax_line_1, as we need to find
                        base lines having a 'affecting_base_tax_ids' ending with [10_affect_base, 20], not only containing
                        '10_affect_base'. Otherwise, base_line_2/3 would also be matched.
                        In our example, as all the taxes are set to be affected by previous ones affecting the base, the
                        result is similar to the table 'account_move_line_account_tax_rel':
                        Id                 Tax_ids
                        -------------------------------------------
                        base_line_1        [10_affect_base, 20]
                        base_line_2        [10_affect_base, 5]
                        base_line_3        [10_affect_base, 5]
                    */
                    SELECT ARRAY_AGG(sub.tax_id ORDER BY sub.sequence, sub.tax_id) AS tax_ids
                    FROM (
                        SELECT
                            %(group_taxes_query)s AS tax_id,
                            tax.sequence
                        FROM account_move_line_account_tax_rel tax_rel
                        JOIN account_tax tax ON tax.id = tax_rel.account_tax_id
                        WHERE tax.is_base_affected
                        AND tax_rel.account_move_line_id = account_move_line.id
                    ) AS sub
                ) tax_line_tax_ids ON TRUE
                LEFT JOIN LATERAL (
                    SELECT ARRAY_AGG(sub.tax_id ORDER BY sub.sequence, sub.tax_id) AS tax_ids
                    FROM (
                        SELECT
                            %(group_taxes_query)s AS tax_id,
                            tax.sequence
                        FROM account_move_line_account_tax_rel tax_rel
                        JOIN account_tax tax ON tax.id = tax_rel.account_tax_id
                        WHERE tax.is_base_affected
                        AND tax_rel.account_move_line_id = base_line.id
                    ) AS sub
                ) base_line_tax_ids ON TRUE
                WHERE account_move_line.tax_repartition_line_id IS NOT NULL
                    AND %(search_condition)s
                    AND (
                        -- keeping only the rows from affecting_base_tax_lines that end with the same taxes applied (see comment in tax_line_tax_ids)
                        NOT tax.include_base_amount
                        OR base_line_tax_ids.tax_ids[ARRAY_LENGTH(base_line_tax_ids.tax_ids, 1) - COALESCE(ARRAY_LENGTH(tax_line_tax_ids.tax_ids, 1), 0):ARRAY_LENGTH(base_line_tax_ids.tax_ids, 1)]
                            = ARRAY[account_move_line.tax_line_id] || COALESCE(tax_line_tax_ids.tax_ids, ARRAY[]::INTEGER[])
                    )
            ),


            tax_amount_affecting_base_to_dispatch AS (

                /*
                Computes the total amount to dispatch in case of tax lines affecting the base of subsequent taxes.
                Such tax lines are an additional base amount for others lines, that will be truly dispatch in next
                CTE.

                In the example:
                    - tax_line_1 is an additional base of 100.0 from base_line_1 for tax_line_2.
                    - tax_line_3 is an additional base of 2/5 * 500.0 = 200.0 from base_line_2 for tax_line_4.
                    - tax_line_3 is an additional base of 3/5 * 500.0 = 300.0 from base_line_3 for tax_line_4.

                    src_line_id    base_line_id     tax_line_id    total_base_amount
                    -------------------------------------------------------------
                    tax_line_1     base_line_1      tax_line_2         1000
                    tax_line_3     base_line_2      tax_line_4         5000
                    tax_line_3     base_line_3      tax_line_4         5000
                */

                SELECT
                    tax_line.id AS tax_line_id,
                    base_line.id AS base_line_id,
                    account_move_line.id AS src_line_id,

                    tax_line.company_id,
                    comp_curr.id AS company_currency_id,
                    comp_curr.decimal_places AS comp_curr_prec,
                    curr.id AS currency_id,
                    curr.decimal_places AS curr_prec,

                    tax_line.tax_line_id AS tax_id,

                    base_line.balance AS base_amount,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.balance < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE base_line.balance
                        END
                    ) OVER (PARTITION BY tax_line.id, account_move_line.id ORDER BY tax_line.tax_line_id, base_line.id) AS cumulated_base_amount,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.balance < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE base_line.balance
                        END
                    ) OVER (PARTITION BY tax_line.id, account_move_line.id) AS total_base_amount,
                    account_move_line.balance AS total_tax_amount,

                    base_line.amount_currency AS base_amount_currency,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.amount_currency < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE base_line.amount_currency
                        END
                    ) OVER (PARTITION BY tax_line.id, account_move_line.id ORDER BY tax_line.tax_line_id, base_line.id) AS cumulated_base_amount_currency,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.amount_currency < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE base_line.amount_currency
                        END
                    ) OVER (PARTITION BY tax_line.id, account_move_line.id) AS total_base_amount_currency,
                    account_move_line.amount_currency AS total_tax_amount_currency

                FROM %(table_references)s
                JOIN account_tax tax_include_base_amount ON
                    tax_include_base_amount.include_base_amount
                    AND tax_include_base_amount.id = account_move_line.tax_line_id
                JOIN base_tax_line_mapping base_tax_line_mapping ON
                    base_tax_line_mapping.tax_line_id = account_move_line.id
                JOIN account_move_line_account_tax_rel tax_rel ON
                    tax_rel.account_move_line_id = base_tax_line_mapping.tax_line_id
                JOIN account_tax tax ON
                    tax.id = tax_rel.account_tax_id
                JOIN base_tax_line_mapping tax_line_matching ON
                    tax_line_matching.base_line_id = base_tax_line_mapping.base_line_id
                JOIN account_move_line tax_line ON
                    tax_line.id = tax_line_matching.tax_line_id
                    AND tax_line.tax_line_id = tax_rel.account_tax_id
                JOIN res_currency curr ON
                    curr.id = tax_line.currency_id
                JOIN res_currency comp_curr ON
                    comp_curr.id = tax_line.company_currency_id
                JOIN account_move_line base_line ON
                    base_line.id = base_tax_line_mapping.base_line_id
                WHERE %(search_condition)s
            ),


            base_tax_matching_base_amounts AS (

                /*
                Build here the full mapping tax lines <=> base lines containing the final base amounts.
                This is done in a 3-parts union.

                Note: src_line_id is used only to build a unique ID.
                */

                /*
                PART 1: raw mapping computed in base_tax_line_mapping.
                */

                SELECT
                    tax_line_id,
                    base_line_id,
                    base_line_id AS src_line_id,
                    base_amount,
                    base_amount_currency
                FROM base_tax_line_mapping

                UNION ALL

                /*
                PART 2: Dispatch the tax amount of tax lines affecting the base of subsequent ones, using
                tax_amount_affecting_base_to_dispatch.

                This will effectively add the following rows:
                base_line_id    tax_line_id     src_line_id     base_amount
                -------------------------------------------------------------
                base_line_1     tax_line_2      tax_line_1      100
                base_line_2     tax_line_4      tax_line_3      200
                base_line_3     tax_line_4      tax_line_3      300
                */

                SELECT
                    sub.tax_line_id,
                    sub.base_line_id,
                    sub.src_line_id,

                    ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount) * sub.total_tax_amount * ABS(sub.cumulated_base_amount) / NULLIF(sub.total_base_amount, 0.0), 0.0),
                        sub.comp_curr_prec
                    )
                    - LAG(ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount) * sub.total_tax_amount * ABS(sub.cumulated_base_amount) / NULLIF(sub.total_base_amount, 0.0), 0.0),
                        sub.comp_curr_prec
                    ), 1, 0.0)
                    OVER (
                        PARTITION BY sub.tax_line_id, sub.src_line_id ORDER BY sub.tax_id, sub.base_line_id
                    ) AS base_amount,

                    ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount_currency) * sub.total_tax_amount_currency * ABS(sub.cumulated_base_amount_currency) / NULLIF(sub.total_base_amount_currency, 0.0), 0.0),
                        sub.curr_prec
                    )
                    - LAG(ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount_currency) * sub.total_tax_amount_currency * ABS(sub.cumulated_base_amount_currency) / NULLIF(sub.total_base_amount_currency, 0.0), 0.0),
                        sub.curr_prec
                    ), 1, 0.0)
                    OVER (
                        PARTITION BY sub.tax_line_id, sub.src_line_id ORDER BY sub.tax_id, sub.base_line_id
                    ) AS base_amount_currency
                FROM tax_amount_affecting_base_to_dispatch sub
                JOIN account_move_line tax_line ON
                    tax_line.id = sub.tax_line_id

                /*
                PART 3: In case of the matching failed because the configuration changed or some journal entries
                have been imported, construct a simple mapping as a fallback. This mapping is super naive and only
                build based on the 'tax_ids' and 'tax_line_id' fields, nothing else. Hence, the mapping will not be
                exact but will give an acceptable approximation.

                Skipped if the 'fallback' method parameter is False.
                */
                %(fallback_query)s
            ),


            base_tax_matching_all_amounts AS (

                /*
                Complete base_tax_matching_base_amounts with the tax amounts (prorata):
                base_line_id    tax_line_id     src_line_id     base_amount     tax_amount
                --------------------------------------------------------------------------
                base_line_1     tax_line_1      base_line_1     1000            100
                base_line_1     tax_line_2      base_line_1     1000            (1000 / 1100) * 220 = 200
                base_line_1     tax_line_2      tax_line_1      100             (100 / 1100) * 220 = 20
                base_line_2     tax_line_3      base_line_2     2000            (2000 / 5000) * 500 = 200
                base_line_2     tax_line_4      base_line_2     2000            (2000 / 5500) * 275 = 100
                base_line_2     tax_line_4      tax_line_3      200             (200 / 5500) * 275 = 10
                base_line_3     tax_line_3      base_line_3     3000            (3000 / 5000) * 500 = 300
                base_line_3     tax_line_4      base_line_3     3000            (3000 / 5500) * 275 = 150
                base_line_3     tax_line_4      tax_line_3      300             (300 / 5500) * 275 = 15
                */

                SELECT
                    sub.tax_line_id,
                    sub.base_line_id,
                    sub.src_line_id,

                    tax_line.tax_line_id AS tax_id,
                    tax_line.group_tax_id,
                    tax_line.tax_repartition_line_id,

                    tax_line.company_id,
                    tax_line.display_type AS display_type,
                    comp_curr.id AS company_currency_id,
                    comp_curr.decimal_places AS comp_curr_prec,
                    curr.id AS currency_id,
                    curr.decimal_places AS curr_prec,
                    (
                        tax.tax_exigibility != 'on_payment'
                        OR tax_move.tax_cash_basis_rec_id IS NOT NULL
                        OR tax_move.always_tax_exigible
                    ) AS tax_exigible,
                    base_line.account_id AS base_account_id,

                    sub.base_amount,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.balance < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE sub.base_amount
                        END
                    ) OVER (PARTITION BY tax_line.id ORDER BY tax_line.tax_line_id, sub.base_line_id, sub.src_line_id) AS cumulated_base_amount,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.balance < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE sub.base_amount
                        END
                    ) OVER (PARTITION BY tax_line.id) AS total_base_amount,
                    tax_line.balance AS total_tax_amount,

                    sub.base_amount_currency,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.amount_currency < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE sub.base_amount_currency
                        END
                    ) OVER (PARTITION BY tax_line.id ORDER BY tax_line.tax_line_id, sub.base_line_id, sub.src_line_id) AS cumulated_base_amount_currency,
                    SUM(
                        CASE WHEN tax.amount_type = 'fixed'
                        THEN CASE WHEN base_line.amount_currency < 0 THEN -1 ELSE 1 END * ABS(COALESCE(base_line.quantity, 1.0))
                        ELSE sub.base_amount_currency
                        END
                    ) OVER (PARTITION BY tax_line.id) AS total_base_amount_currency,
                    tax_line.amount_currency AS total_tax_amount_currency

                FROM base_tax_matching_base_amounts sub
                JOIN account_move_line tax_line ON
                    tax_line.id = sub.tax_line_id
                JOIN account_move tax_move ON
                    tax_move.id = tax_line.move_id
                JOIN account_move_line base_line ON
                    base_line.id = sub.base_line_id
                JOIN account_tax tax ON
                    tax.id = tax_line.tax_line_id
                JOIN res_currency curr ON
                    curr.id = tax_line.currency_id
                JOIN res_currency comp_curr ON
                    comp_curr.id = tax_line.company_currency_id

            )


           /* Final select that makes sure to deal with rounding errors, using LAG to dispatch the last cents. */

            SELECT
                sub.tax_line_id || '-' || sub.base_line_id || '-' || sub.src_line_id AS id,

                sub.base_line_id,
                sub.tax_line_id,
                sub.display_type,
                sub.src_line_id,

                sub.tax_id,
                sub.group_tax_id,
                sub.tax_exigible,
                sub.base_account_id,
                sub.tax_repartition_line_id,

                sub.base_amount,
                COALESCE(
                    ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount) * sub.total_tax_amount * ABS(sub.cumulated_base_amount) / NULLIF(sub.total_base_amount, 0.0), 0.0),
                        sub.comp_curr_prec
                    )
                    - LAG(ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount) * sub.total_tax_amount * ABS(sub.cumulated_base_amount) / NULLIF(sub.total_base_amount, 0.0), 0.0),
                        sub.comp_curr_prec
                    ), 1, 0.0)
                    OVER (
                        PARTITION BY sub.tax_line_id ORDER BY sub.tax_id, sub.base_line_id
                    ),
                    0.0
                ) AS tax_amount,

                sub.base_amount_currency,
                COALESCE(
                    ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount_currency) * sub.total_tax_amount_currency * ABS(sub.cumulated_base_amount_currency) / NULLIF(sub.total_base_amount_currency, 0.0), 0.0),
                        sub.curr_prec
                    )
                    - LAG(ROUND(
                        COALESCE(SIGN(sub.cumulated_base_amount_currency) * sub.total_tax_amount_currency * ABS(sub.cumulated_base_amount_currency) / NULLIF(sub.total_base_amount_currency, 0.0), 0.0),
                        sub.curr_prec
                    ), 1, 0.0)
                    OVER (
                        PARTITION BY sub.tax_line_id ORDER BY sub.tax_id, sub.base_line_id
                    ),
                    0.0
                ) AS tax_amount_currency
            FROM base_tax_matching_all_amounts sub
            ''',
            extra_query_base_tax_line_mapping=extra_query_base_tax_line_mapping,
            group_taxes_query=group_taxes_query,
            search_condition=search_condition,
            table_references=table_references,
            fallback_query=fallback_query,
        )
