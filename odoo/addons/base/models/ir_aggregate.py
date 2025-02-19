from ast import literal_eval
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
import typing

from odoo import models, fields, api, Command
from odoo.exceptions import UserError
from odoo.fields import Domain
from odoo.orm.types import DomainType
from odoo.orm.utils import SQL_OPERATORS
from odoo.tools import SQL, frozendict, ormcache, Query

PRECOMMIT_KEY = 'ir.aggregate.create_vals'


@dataclass(slots=True, frozen=True)
class IrAggregateConfigData:
    id: int
    domain: Domain
    field_names: tuple[str]
    groupby: tuple[str, ...]


class GroupBySpec(models.Model):
    _name = 'ir.aggregate.groupby.spec'
    _description = "Aggregate config groupby spec"

    config_id = fields.Many2one('ir.aggregate.config', required=True, ondelete='cascade')
    model_id = fields.Many2one(related='config_id.model_id')
    field_id = fields.Many2one(
        comodel_name='ir.model.fields',
        required=True,
        ondelete='cascade',
        domain="[('model_id', '=', model_id)]"
    )
    granularity = fields.Selection(
        selection=[
            ('year', 'Year'),
            ('month', 'Month'),
            ('day', 'Day'),
        ],
    )
    key = fields.Char(compute='_compute_key')

    @api.depends('field_id', 'granularity')
    def _compute_key(self):
        for spec in self:
            key = spec.field_id.name
            if spec.granularity:
                key = "%s:%s" % (key, spec.granularity)
            spec.key = key

    @api.constrains('field_id', 'granularity')
    def _check_granularity(self):
        for spec in self:
            if spec.field_id.ttype in ('date', 'datetime'):
                if not spec.granularity:
                    raise UserError(self.env._("Date groups should have a granularity"))
            elif spec.granularity:
                raise UserError(self.env._("Granularity should only be set on date groups"))


class IrAggregateConfig(models.Model):
    _name = 'ir.aggregate.config'
    _description = "Counter Config"

    domain = fields.Char()
    model_id = fields.Many2one(
        comodel_name='ir.model',
        required=True,
        ondelete='cascade',
        domain=[('abstract', '=', False), ('transient', '=', False)],
    )
    model_name = fields.Char(string="Model Name", related='model_id.model')
    field_ids = fields.Many2many(
        comodel_name='ir.model.fields',
        domain="[('ttype', 'in', ('integer', 'float', 'monetary')), ('model_id', '=', model_id)]",
        help="The number of records is always counted",
    )
    groupby_ids = fields.One2many(comodel_name='ir.aggregate.groupby.spec', inverse_name='config_id')
    groupby = fields.Char(string="Groupby string", compute='_compute_groupby', inverse='_inverse_groupby')

    @api.depends('groupby_ids')
    def _compute_groupby(self):
        for config in self:
            config.groupby = ','.join(config._grouping_key())

    def _inverse_groupby(self):
        for config in self:
            commands = [Command.clear()]
            if config.groupby:
                for groupby_spec in config.groupby.split(','):
                    fname, _property_name, granularity = models.parse_read_group_spec(groupby_spec)
                    commands.append(Command.create({
                        'field_id': self.env['ir.model.fields']._get(config.model_name, fname).id,
                        'granularity': granularity,
                    }))
            config.groupby_ids = commands

    def refresh_counters(self):
        self.check_access('read')
        self.env['ir.aggregate']._prepare_create([
            {
                'config_id': counter.config_id.id,
                'value': {k: -v for k, v in counter.value.items()},  # reverse existing values
                'groupby': counter.groupby,
            }
            for counter in self.env['ir.aggregate'].search([('config_id', 'in', self.ids)])
        ] + [
            {
                'config_id': config.id,
                'value': {'__count': value},
                'groupby': {
                    k: self.env['ir.aggregate']._format_group_value(v, k)
                    for k, v in zip(config._grouping_key(), grouping_values)
                },
            }
            for config in self
            for *grouping_values, value in self.env[config.model_id.model].with_context(ignore_ir_aggregate=True)._read_group(
                domain=literal_eval(config.domain or "[]"),
                groupby=config._grouping_key(),
                aggregates=[f'{field.name}:sum' for field in config.field_ids] + ['__count'],
            )
        ])

    @api.model_create_multi
    def create(self, vals_list):
        self.env.registry.clear_cache()
        configs = super().create(vals_list)
        configs.refresh_counters()
        return configs

    def write(self, vals):
        self.env.registry.clear_cache()
        res = super().write(vals)
        self.refresh_counters()
        return res

    @ormcache('model')
    def _get(self, model):
        return frozendict({
            (data.domain, data.groupby): data
            for data in (
                IrAggregateConfigData(
                    id=config.id,
                    domain=Domain(literal_eval(config.domain or "[]"))._optimize(self.env[model]),
                    field_names=tuple(field.name for field in config.field_ids) + ('__count',),
                    groupby=tuple(sorted(config._grouping_key())),
                )
                for config in self.sudo().search([('model_id.model', '=', model)])
            )
        })

    def _grouping_key(self):
        return self.groupby_ids.mapped('key')


class IrAggregate(models.Model):
    _name = 'ir.aggregate'
    _description = "Counter"
    _log_access = False

    config_id = fields.Many2one('ir.aggregate.config', required=True, ondelete='cascade')
    value = fields.Json()
    groupby = fields.Json()

    _index = models.Index("USING btree(config_id, groupby)")

    def _field_to_sql(self, alias: str, field_expr: str, query: (Query | None) = None, flush: bool = True) -> SQL:
        if field_expr.startswith(('groupby.', 'value.')):
            fname, selector = field_expr.split('.')
            return SQL(
                "%(fname)s->>%(selector)s",
                fname=self._field_to_sql(alias, fname, query, flush),
                selector=selector,
            )
        return super()._field_to_sql(alias, field_expr, query, flush)

    def _where_calc(self, domain: DomainType, active_test: bool = True) -> Query:
        self.env['ir.aggregate']._flush_create()
        return super()._where_calc(domain, active_test)

    def get_values(
            self,
            model_name: str,
            domain: DomainType,
            groupby: typing.Iterable[str],
            aggregates: typing.Iterable[str],
            having: DomainType | None = None
        ) -> list | None:
        Model = self.env[model_name]
        Model.check_access('read')
        domain = Domain(domain)._optimize(self.env[model_name])
        aggregates = [agg.removesuffix(":sum") for agg in aggregates]
        groupby = list(groupby)
        config = self.env['ir.aggregate.config']._get(model_name).get((domain, tuple(sorted(groupby))))
        if (
            not config
            or not all(agg in config.field_names for agg in aggregates)
            or not all(fname in config.groupby for fname, *__ in (having or []))
        ):
            return None

        query = self._search([('config_id', '=', config.id)])
        query.groupby = self._field_to_sql(query.table, "groupby", query)
        query.order = SQL("MIN(%s)", self._field_to_sql(query.table, "id", query))  # only needed to have determinism in tests
        sql_aggregates = [
            SQL("SUM(COALESCE(%s, '0')::float)", self._field_to_sql(query.table, f'value.{fname}', query))
            for fname in aggregates
        ]
        query.having = SQL(" AND ").join(
            [SQL("%s != 0", agg) for agg in sql_aggregates]  # Discard zero aggregates
            + [  # Manage `having` parameter
                SQL(
                    "(%s)::%s%s%s",
                    self._field_to_sql(query.table, f'groupby.{fname}', query),
                    SQL(Model._fields[fname]._column_type[1]),
                    SQL_OPERATORS[operator],
                    value,
                )
                for fname, operator, value in having or []
            ]
        )

        values = self.env.execute_query_dict(query.select(query.groupby, *(
            SQL("%s AS %s", agg, SQL.identifier(fname))
            for agg, fname in zip(sql_aggregates, aggregates)
        )))
        if not values:
            # Behave the same as read_group
            values = [dict.fromkeys(list(aggregates) + ['groupby'])]

        return self._format_get_values(values, Model, aggregates, groupby)

    def _format_get_values(self, values, model, aggregates, groupby):
        return [
            (
                *(
                    model._fields[models.parse_read_group_spec(gb)[0]].convert_to_cache(row_value['groupby'][gb], self)
                    for gb in groupby
                ),
                *(row_value[agg] for agg in aggregates),
            )
            for row_value in values
        ]

    def _map_to_config(self, records):
        # TODO perf: batch the filtered domain by making it a tree
        return {
            config: records.filtered_domain(config.domain)
            for config in self.env['ir.aggregate.config']._get(records._name).values()
        }

    @api.model
    def _process(self, records, add=False, remove=False):
        sign = add - remove
        self.env['ir.aggregate']._prepare_create([
            {
                'config_id': config.id,
                'value': {
                    field_name: sign * (
                        1 if field_name == '__count' else record[field_name]
                    )
                    for field_name in config.field_names
                },
                'groupby': {
                    k: self._group_value(record, k)
                    for k in config.groupby
                },
            }
            for config, records in self._map_to_config(records).items()
            for record in records
        ])

    def _group_value(self, record, groupby_spec):
        fname, property_name, _granularity = models.parse_read_group_spec(groupby_spec)
        value = record[fname]
        if property_name:
            value = value[property_name]
        return self._format_group_value(value, groupby_spec)

    def _format_group_value(self, value, groupby_spec):
        _fname, _property_name, granularity = models.parse_read_group_spec(groupby_spec)
        if isinstance(value, datetime):
            value = date(value.year, value.month, value.day)
        if isinstance(value, date):
            if granularity == 'year':
                value = value.replace(month=1, day=1)
            elif granularity == 'month':
                value = value.replace(day=1)
            elif granularity != 'day':
                raise ValueError('Date/Datetime fields must have a granularity (support for year, month, day)')
            value = str(value)
        if isinstance(value, models.Model):
            value = value.id
        return value

    def _prepare_create(self, vals_list):
        if PRECOMMIT_KEY not in self.env.cr.precommit.data:
            self.env.cr.precommit.data[PRECOMMIT_KEY] = []
            self.env.cr.precommit.add(self.env['ir.aggregate']._flush_create)
        self.env.cr.precommit.data[PRECOMMIT_KEY].extend(vals_list)

    def _flush_create(self):
        if PRECOMMIT_KEY not in self.env.cr.precommit.data:
            return
        self.env['ir.aggregate'].sudo().create(self._preprocess_create_vals(self.env.cr.precommit.data[PRECOMMIT_KEY]))
        self.env.cr.precommit.data[PRECOMMIT_KEY].clear()

    def _preprocess_create_vals(self, vals_list):
        # Merge the lines to create as little rows as possible
        # Future duplicates will be removed by `_merge`
        aggregator = defaultdict(lambda: defaultdict(float))
        for vals in vals_list:
            for key, value in vals['value'].items():
                aggregator[vals['config_id'], frozendict(vals.get('groupby') or ())][key] += value
        return [
            {'config_id': config_id, 'groupby': groupby, 'value': value}
            for (config_id, groupby), value in aggregator.items()
            if any(v for v in value.values())
        ]

    @api.autovacuum
    def _merge(self):
        self.invalidate_model()
        self.env.cr.execute(SQL(
            """
            /* Use a procedure to avoid any joins in the DELETE FROM queries
             * Managing NULL values for `groupby` can also cause non trivial performance issues
             */
            DO $$
            DECLARE to_update record;
            BEGIN
                FOR to_update IN
                    SELECT config_id,
                           groupby,
                           jsonb_strip_nulls(jsonb_object_agg(key, sum)) AS value,
                           MIN(min_id) AS min_id
                      FROM (
                                  SELECT config_id,
                                         groupby,
                                         extracted.key,
                                         NULLIF(SUM(extracted.value::float), 0) AS sum,
                                         MIN(id) AS min_id,
                                         COUNT(*)
                                    FROM %(table)s
                              CROSS JOIN jsonb_each(value) AS extracted
                                GROUP BY config_id,
                                         groupby,
                                         extracted.key
                           ) AS per_key
                  GROUP BY config_id,
                           groupby
                    HAVING (SUM(count) > 1 OR jsonb_strip_nulls(jsonb_object_agg(key, sum)) = '{}')
                LOOP
                    UPDATE %(table)s
                       SET value = to_update.value
                     WHERE id = to_update.min_id
                       AND value != to_update.value;

                    IF to_update.groupby IS NULL THEN
                        DELETE FROM %(table)s
                              WHERE config_id = to_update.config_id
                                AND groupby IS NULL
                                AND (id > to_update.min_id OR to_update.value = '{}');
                    ELSE
                        DELETE FROM %(table)s
                              WHERE config_id = to_update.config_id
                                AND groupby = to_update.groupby
                                AND (id > to_update.min_id OR to_update.value = '{}');
                    END IF;
                END LOOP;
            END$$;
            ANALYZE %(table)s;
            """,
            table=SQL.identifier(self._table),
        ))
