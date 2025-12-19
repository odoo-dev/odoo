import logging
from collections import defaultdict

from odoo import api, fields, models, tools
from odoo.fields import Domain
from odoo.tools import OrderedSet, SQL

_logger = logging.getLogger(__name__)


class MixinAggregateSource(models.AbstractModel):
    _name = 'mixin.ir.aggregate.source'
    _description = "Table supporting aggregates"

    @api.model
    def _read_group(self, domain, groupby=(), aggregates=(), having=(), offset=0, limit=None, order=None):
        self.browse().check_access('read')
        # XXX search domain first? (active test)
        domain = Domain(domain).optimize_full(self)
        for agg_model in self._get_aggregated_models():
            agg = self.env[agg_model]
            if not agg.has_access('read'):
                continue
            if any(cond._field(self).name not in agg._fields for cond in domain.iter_conditions()) or domain.is_false():
                continue
            if not (~agg._source_domain & domain).optimize_full(self).is_false():  # XXX needs new optimization (distribute in nary)
                continue
            try:
                return agg._read_group(domain, groupby, aggregates, having, offset, limit, order)
            except Exception:
                _logger.debug("Could not use %s", agg_model, exc_info=True)

        return super()._read_group(domain, groupby, aggregates, having, offset, limit, order)

    @api.model
    @tools.ormcache(cache='stable')
    def _get_aggregated_trigger_fields(self):
        all_fields = OrderedSet()
        for agg_model in self._get_aggregated_models():
            agg = self.sudo().env[agg_model]
            for fields in agg._get_trigger_fields():
                all_fields.update(fields)
        return all_fields

    @api.model
    @tools.ormcache(cache='stable')
    def _get_aggregated_models(self):
        return tuple(model._name for model in self.env.values() if not model._abstract and isinstance(model, MixinAggregate))

    def __aggregate_signal(self, *, create=False, delete=False):
        records = self.filtered(lambda r: r.id).sudo()  # only real records
        if not records:
            return
        precommit = self.env.cr.precommit
        data = precommit.data.get(f'ir.aggregate.{self._name}')
        if data is None:  # first call
            precommit.add(self.sudo().__aggregate_finalize)
            precommit.data[f'ir.aggregate.{self._name}'] = data = defaultdict(dict)
        if delete:
            precommit.data[f'ir.aggregate.{self._name}.delete'] = True
        records.fetch(self._get_aggregated_trigger_fields())
        for model_name in records._get_aggregated_models():
            records.env[model_name]._pre_process_records(data[model_name], records, created=create)

    def __aggregate_finalize(self):
        assert self.env.su
        precommit_data = self.env.cr.precommit.data
        data = precommit_data.pop(f'ir.aggregate.{self._name}', None)
        if not data:
            return
        records = self.browse(id_ for ids in data.values() for id_ in ids)

        check_delete = precommit_data.pop(f'ir.aggregate.{self._name}.delete', False)
        if check_delete:
            existing_records = records.exists()
            deleted_ids = set(records._ids) - set(existing_records._ids)
            if deleted_ids:
                for agg_model in self._get_aggregated_models():
                    data[agg_model].setdefault('deleted', set()).update(deleted_ids)
                records = existing_records
        records.fetch(self._get_aggregated_trigger_fields())
        for agg_model in self._get_aggregated_models():
            self.env[agg_model]._post_process_records(data[agg_model])

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records.__aggregate_signal(create=True)
        return records

    def write(self, vals):
        if self._get_aggregated_trigger_fields().intersection(vals):
            self.__aggregate_signal()
        return super().write(vals)

    def unlink(self):
        self.__aggregate_signal(delete=True)
        return super().unlink()

    def _compute_field_value(self, field):
        if field.name in self._get_aggregated_trigger_fields():
            self.__aggregate_signal()
        return super()._compute_field_value(field)


class MixinAggregate(models.AbstractModel):
    _name = 'mixin.ir.aggregate'
    _description = "Aggregated Table"

    _source_model: str = ''
    """Table being aggregated (mixin.ir.aggregate.source)"""
    _source_domain: Domain = Domain.TRUE

    #_count = fields.Integer(metric='id')  # XXX todo

    def _valid_field_parameter(self, field, name):
        return super()._valid_field_parameter(field, name) or (
            name == 'metric' and not field.relational
        )

    def _check_access(self, operation):
        if operation != 'read':
            return False
        # XXX
        return super()._check_access(operation)

    def _search(self, domain, *a, **kw):
        source_model = self.env[self._source_model]
        domain = Domain(domain).optimize(source_model)
        query = source_model._search(domain)
        if query.is_empty():
            return self.browse()._as_query()
        return super()._search(domain, *a, **kw)

    @api.model
    @tools.ormcache(cache='stable')
    def _get_trigger_fields(self):
        if self._abstract:
            return (), (), ()
        source_model = self.env[self._source_model]
        source_fields = source_model._fields

        dimension_fields = []
        metric_fields = []
        for field in self._fields.values():
            if field.name in ('id', '_count') or not field.store or not field.column_type:
                continue
            if (field._args__ or {}).get('metric'):
                assert field.type in ('integer', 'float', 'monetary'), f"Unsupported metric field: {field}"
                metric_fields.append(field.name)
            else:
                assert field.type not in ('datetime', 'json', 'properties'), f"Unsupported dimension field: {field}"
                dimension_fields.append(field.name)
            assert field.name in source_fields, f"Field not in source: {field}"

        other_fields = []
        self._source_domain.optimize(source_model)  # check fields
        for cond in self._source_domain.iter_conditions():
            assert 'any' not in cond.operator, f"Unsupported 'any' in {self._name}._source_domain"
            field = cond._field(self)
            assert (
                field.store and field.column_type
                and field.type not in ('one2many', 'many2many', 'properties')
            ), f"Unsupported field {field} in {self._name}._source_domain"
            other_fields.append(field.name)

        return tuple(dimension_fields), tuple(metric_fields), tuple(other_fields)

    @api.model
    @tools.ormcache(cache='stable')
    def _get_dimesion(self):
        dimension_fields = self._get_trigger_fields()[0]
        def dimension(record):
            return tuple(val.id if isinstance(val, models.BaseModel) else val for f in dimension_fields if (val := record[f]) or True)
        return dimension

    def _pre_process_records(self, data: dict, records: models.BaseModel, created: bool = False):
        if created:
            if dimensions := data.get('dimensions'):
                for record_id in records._ids:
                    dimensions.pop(record_id, None)
            return

        dimension_fields, metric_fields, _other_fields = self._get_trigger_fields()
        f_dim = self._get_dimesion()

        dimensions = data.setdefault('dimensions', {})
        metrics = data.setdefault('metrics', {})
        for record in records.filtered_domain(self._source_domain):
            record_id = record.id
            if record_id in dimensions:
                continue
            dimensions[record_id] = f_dim(record)
            metrics[record_id] = [-record[field] for field in metric_fields]

    def _post_process_records(self, data: dict):
        model = self.env[self._source_model]
        dimension_fields, metric_fields, _other_fields = self._get_trigger_fields()
        f_dim = self._get_dimesion()
        aggregate = defaultdict(lambda: [0] * len(metric_fields))

        deleted_ids = data.get('deleted', ())
        old_metrics = data['metrics']
        for record_id, dimensions in data['dimensions'].items():
            if dimensions:
                for i, f in enumerate(metric_fields):
                    aggregate[dimensions][i] += old_metrics[record_id][f]
            if record_id in deleted_ids:
                continue
            record = model.browse(record_id)
            dimensions = f_dim(record)
            for i, f in enumerate(metric_fields):
                aggregate[dimensions][i] += record[f]
        data.clear()

        created_fields = dimension_fields + metric_fields
        self.create([
            dict(zip(created_fields, dimensions + tuple(metrics), strict=True))
            for dimensions, metrics in aggregate.items()
            if any(metrics)
        ])

    @api.model
    def _init_aggregate(self):
        self.env.flush_all()
        self.invalidate_model(flush=False)
        self.env.execute_query(SQL("TRUNCATE TABLE %s", self._table_sql))
        ...

    @api.model
    def _cron_compact_aggregate(self):
        ...

    def _register_hook(self):
        # optimize the domain and resolve fields
        assert not self._log_access, "Disable log access"
        if not self._abstract:
            type(self)._source_domain = self._source_domain.optimize(self)
            self._get_trigger_fields()

        return super()._register_hook()
