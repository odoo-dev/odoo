# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""
This module improves reconciliation performance by precalculating and storing slow regexp used by the reconciliation.
It stores regexp values using computed and stored fields and
 overrides the query to replace regexps by reference to computed fields (columns).
"""
import re

from odoo import models, api, fields


class AccountBankStatementLine(models.Model):
    _inherit = 'account.bank.statement.line'

    precalculated_num = fields.Char(readonly=True, compute='_precalculated_num', store=True)

    @api.depends('name')
    def _precalculated_num(self):
        for st_line in self:
            if st_line.name:
                st_line.precalculated_num = re.sub(r'[^0-9|^\s]', '', st_line.name).strip()


class AccountMove(models.Model):
    _inherit = 'account.move'

    precalculated_num = fields.Char(readonly=True, compute='_precalculated_num', store=True)
    precalculated_ref = fields.Char(readonly=True, compute='_precalculated_ref', store=True)

    @api.depends('name')
    def _precalculated_num(self):
        for move in self:
            if move.name:
                move.precalculated_num = re.sub(r'[^0-9|^\s]', '', move.name).strip()

    @api.depends('ref')
    def _precalculated_ref(self):
        for move in self:
            if move.ref:
                move.precalculated_ref = re.sub(r'[^0-9|^\s]', '', move.ref).strip()


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    precalculated_num = fields.Char(readonly=True, compute='_precalculated_num', store=True)

    @api.depends('name')
    def _precalculated_num(self):
        for aml in self:
            if aml.name:
                aml.precalculated_num = re.sub(r'[^0-9|^\s]', '', aml.name).strip()


class AccountReconcileModel(models.Model):
    _inherit = 'account.reconcile.model'

    def _get_invoice_matching_query(self, st_lines, excluded_ids=None, partner_map=None):
        """
        Equivalent to account.reconcile.model._get_invoice_matching_query except it
         replaces expressions that are precalculated by the fields containing precalculated values
        """
        expr_to_precalc_field = {
            "substring(REGEXP_REPLACE(aml.name, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*')": 'aml.precalculated_num',
            "substring(REGEXP_REPLACE(st_line.name, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*')": 'st_line.precalculated_num',
            "substring(REGEXP_REPLACE(move.name, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*')": 'move.precalculated_num',
            "substring(REGEXP_REPLACE(move.ref, '[^0-9|^\s]', '', 'g'), '\S(?:.*\S)*')": 'move.precalculated_ref',
        }

        raw_query, params = super()._get_invoice_matching_query(st_lines, excluded_ids=None, partner_map=None)

        query_with_precalc = raw_query
        for expr, precalc_field in expr_to_precalc_field.items():
            query_with_precalc = query_with_precalc.replace(expr, precalc_field)

        return query_with_precalc, params
