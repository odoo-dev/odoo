# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import reprlib

import psycopg2

from odoo import _, api, fields, models
from odoo.tools.speedscope import shorten
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)


class IrProfileQuery(models.Model):
    _name = 'ir.profile.query'
    _description = 'Profiling Query'
    _log_access = False  # avoid useless foreign key on res_user
    _order = 'sequence, id'
    _allow_sudo_commands = False

    profile_id = fields.Many2one('ir.profile', required=True, ondelete='cascade', index=True, readonly=True)
    sequence = fields.Integer(readonly=True)
    time = fields.Float(string="Time (seconds)", help="Time spent executing the query", readonly=True, min_display_digits=6)
    query = fields.Text(readonly=True,
        help="Query with placeholders, before injecting the parameters")
    full_query = fields.Text(required=True, prefetch=False, readonly=True, help="Query with its parameters injected, ready to execute")
    query_preview = fields.Text(compute='_compute_query_preview')
    plan = fields.Text('Query Plan', prefetch=False, readonly=True)

    @api.depends('plan')
    def _compute_plan_url(self):
        for query in self:
            if query.plan:
                query.plan_url = f'/web/query_plan/{query.id}'
            else:
                query.plan_url = False

    @api.depends('query')
    def _compute_query_preview(self):
        for query in self:
            query.query_preview = shorten(query.query)

    @api.depends('query_preview')
    def _compute_display_name(self):
        for query in self:
            query.display_name = query.query_preview

    def _create_from_sql_blob(self, sql_blob_str: str):
        blob = json.loads(sql_blob_str)
        [{
            'sequence': i,
            'query': query['query'],
            'full_query': query['full_query'],
        } for i, query in enumerate(blob)]

    def action_explain_analyse(self):
        if not self.env.user._is_system():
            raise AccessError(_("You are not allowed to generate a query plan."))
        self.ensure_one()
        _logger.info("Generating query plan for query %s", self.id)
        try:
            with self.env.cr.savepoint() as sp:
                # Not everything can be explained:
                # SAVEPOINT/RELEASE/SET/LOCK/... are in the profile, which EXPLAIN rejects
                # with a psycopg2.errors.SyntaxError.
                # pylint: disable=E8501
                self.env.cr.execute(
                    f'EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) {self.full_query}',
                    log_exceptions=False,
                )
                plan = self.env.cr.fetchone()[0]
                sp.rollback()
        except psycopg2.Error as e:
            raise UserError(_("This query cannot be explained.")) from e
        self.plan = json.dumps(plan)
        # return self.action_open_plan_visualizer()
