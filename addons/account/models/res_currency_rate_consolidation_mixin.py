# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.tools import SQL


class ConsolidationRateMixin(models.AbstractModel):
    _name = 'res.currency.rate.consolidation.mixin'
    _description = "Enable multi company consolidation"

    consolidation_rate = fields.Float(
        string="Rate",
        compute='_compute_consolidation_rate',
        compute_sql='_compute_sql_consolidation_rate',
        compute_sudo=True,
        digits=0,
        aggregator=None,
    )
    consolidation_currency_id = fields.Many2one(
        comodel_name='res.currency',
        compute='_compute_consolidation_currency_id',
        compute_sql='_compute_sql_consolidation_currency_id',
        compute_sudo=True,
    )

    @api.depends_context('allowed_company_ids')
    def _compute_consolidation_rate(self):
        if len(self.env.companies.currency_id) <= 1:
            self.consolidation_rate = 1
            return
        query = self._search([('id', 'in', self.ids)])
        line2rate = dict(self.env.execute_query(query.select(query.table.id, query.table.consolidation_rate)))
        for record in self:
            record.consolidation_rate = line2rate.get(record._origin.id, 1)

    def _compute_sql_consolidation_rate(self, table):
        if len(self.env.companies.currency_id) == 1:
            return SQL("1")

        date_to = fields.Date.to_date(self.env.context.get('date_to'))
        _historical, _cta_intervals, current_table = self.env['res.currency']._get_consolidation_rate_tables(
            self.env.companies - self.env.company, date_to, date_to,
        )

        current_alias = table._make_alias('raw_currencies')
        table._query.add_join(kind='JOIN', alias=current_alias, table=current_table, condition=SQL("TRUE"))
        return SQL("COALESCE((%s->>(%s::text))::numeric, 1)", current_alias.rates, table.company_id)

    def _compute_sql_consolidation_currency_id(self, table):
        return SQL("%s", self.env.company.currency_id.id)

    @api.depends_context('company')
    def _compute_consolidation_currency_id(self):
        self.consolidation_currency_id = self.env.company.currency_id
