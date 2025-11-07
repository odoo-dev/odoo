from __future__ import annotations

import typing
from collections import defaultdict
from operator import attrgetter

from odoo.tools import OrderedSet, unique, SQL
from odoo.tools.sql import pg_varchar

from .fields import Field
from .fields_numeric import Integer
from .fields_selection import Selection
from .models import BaseModel

if typing.TYPE_CHECKING:
    OnDelete = typing.Literal['cascade', 'restrict', 'set null']


class Reference(Selection):
    """ Pseudo-relational field (no FK in database).

    The field value is stored as a :class:`string <str>` following the pattern
    ``"res_model,res_id"`` in database.
    """
    type = 'reference'

    _column_type = ('varchar', pg_varchar())

    def convert_to_column(self, value, record, values=None, validate=True):
        return Field.convert_to_column(self, value, record, values, validate)

    def convert_to_cache(self, value, record, validate=True):
        # cache format: str ("model,id") or None
        if isinstance(value, BaseModel):
            if not validate or (value._name in self.get_values(record.env) and len(value) <= 1):
                return "%s,%s" % (value._name, value.id) if value else None
        elif isinstance(value, str):
            res_model, res_id = value.split(',')
            if not validate or res_model in self.get_values(record.env):
                if record.env[res_model].browse(int(res_id)).exists():
                    return value
                else:
                    return None
        elif not value:
            return None
        raise ValueError("Wrong value for %s: %r" % (self, value))

    def convert_to_record(self, value, record):
        if value:
            res_model, res_id = value.split(',')
            return record.env[res_model].browse(int(res_id))
        return None

    def convert_to_read(self, value, record, use_display_name=True):
        return "%s,%s" % (value._name, value.id) if value else False

    def convert_to_export(self, value, record):
        return value.display_name if value else ''

    def convert_to_display_name(self, value, record):
        return value.display_name if value else False


class Many2oneReference(Integer):
    """ Pseudo-relational field (no FK in database).

    The field value is stored as an :class:`integer <int>` id in database.

    Contrary to :class:`Reference` fields, the model has to be specified
    in a :class:`Char` field, whose name has to be specified in the
    `model_field` attribute for the current :class:`Many2oneReference` field.

    :param str model_field: name of the :class:`Char` where the model name is stored.
    """
    type = 'many2one_reference'

    model_field = None
    aggregator = None
    ondelete: OnDelete | None = None    # what to do when value is deleted

    _related_model_field = property(attrgetter('model_field'))

    _description_model_field = property(attrgetter('model_field'))

    def setup_nonrelated(self, model):
        super().setup_nonrelated(model)
        if not self.ondelete:
            self.ondelete = 'cascade'

    def convert_to_cache(self, value, record, validate=True):
        # cache format: id or None
        if isinstance(value, BaseModel):
            value = value._ids[0] if value._ids else None
        return super().convert_to_cache(value, record, validate)

    def _update_inverses(self, records: BaseModel, value):
        """ Add `records` to the cached values of the inverse fields of `self`. """
        if not value:
            return
        model_ids = self._record_ids_per_res_model(records)

        for invf in records.pool.field_inverses[self]:
            records = records.browse(model_ids[invf.model_name])
            if not records:
                continue
            corecord = records.env[invf.model_name].browse(value)
            records = records.filtered_domain(invf.get_comodel_domain(corecord))
            if not records:
                continue
            ids0 = invf._get_cache(corecord.env).get(corecord.id)
            # if the value for the corecord is not in cache, but this is a new
            # record, assign it anyway, as you won't be able to fetch it from
            # database (see `test_sale_order`)
            if ids0 is not None or not corecord.id:
                ids1 = tuple(unique((ids0 or ()) + records._ids))
                invf._update_cache(corecord, ids1)

    def _record_ids_per_res_model(self, records: BaseModel) -> dict[str, OrderedSet]:
        model_ids = defaultdict(OrderedSet)
        for record in records:
            model = record[self.model_field]
            if not model and record._fields[self.model_field].compute:
                # fallback when the model field is computed :-/
                record._fields[self.model_field].compute_value(record)
                model = record[self.model_field]
                if not model:
                    continue
            model_ids[model].add(record.id)
        return model_ids

    def _delete_polymorphic_function_name(self, model: BaseModel) -> SQL:
        return SQL(f"fn_delete_polymorphic_{model._table}")

    def _create_polymorphic_function(self, env):
        model = env[self.model_name]
        if self.ondelete == 'cascade':
            model.env.cr.execute(SQL(
                """
                CREATE OR REPLACE FUNCTION %(func_name)s() RETURNS TRIGGER AS $$
                BEGIN
                    DELETE FROM %(table)s
                          WHERE TG_TABLE_NAME ~ ('^' || %(model_field)s || '$')
                            AND OLD.id = %(id_field)s;
                    RETURN OLD;
                END;
                $$ LANGUAGE plpgsql
                """,
                func_name=self._delete_polymorphic_function_name(model),
                model_field=SQL.identifier(self.model_field),
                id_field=SQL.identifier(self.name),
                table=SQL.identifier(model._table),
            ))
        elif self.ondelete == 'prevent':
            model.env.cr.execute(SQL(
                """
                CREATE OR REPLACE FUNCTION %(func_name)s() RETURNS TRIGGER AS $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                          FROM %(table)s
                         WHERE TG_TABLE_NAME ~ ('^' || %(model_field)s || '$')
                           AND OLD.id = %(id_field)s
                    ) THEN
                        RAISE EXCEPTION 'Cannot delete row from %% (id=%%) because it is still referenced in %(table)s',
                                        TG_TABLE_NAME,
                                        OLD.id;
                    END IF;
                    RETURN OLD;
                END;
                $$ LANGUAGE plpgsql
                """,
                func_name=self._delete_polymorphic_function_name(model),
                model_field=SQL.identifier(self.model_field),
                id_field=SQL.identifier(self.name),
                table=SQL.identifier(model._table),
            ))
        elif self.ondelete == 'set null':
            model.env.cr.execute(SQL(
                """
                CREATE OR REPLACE FUNCTION %(func_name)s() RETURNS TRIGGER AS $$
                BEGIN
                         UPDATE %(table)s
                            SET %(model_field)s = NULL,
                                %(id_field)s = NULL
                          WHERE TG_TABLE_NAME ~ ('^' || %(model_field)s || '$')
                            AND OLD.id = %(id_field)s;
                    RETURN OLD;
                END;
                $$ LANGUAGE plpgsql
                """,
                func_name=self._delete_polymorphic_function_name(model),
                model_field=SQL.identifier(self.model_field),
                id_field=SQL.identifier(self.name),
                table=SQL.identifier(model._table),
            ))

    def _apply_polymorphic_trigger(self, env, model_names):
        if self.ondelete == 'cascade':
            for model_name in model_names:
                env.cr.execute(SQL(
                    """
         CREATE OR REPLACE TRIGGER trg_cascade_delete_%(source)s__%(table)s
                     AFTER DELETE ON %(table)s
                       FOR EACH ROW
                   EXECUTE FUNCTION %(func_name)s()
                    """,
                    source=SQL(env[self.model_name]._table),
                    table=SQL(env[model_name]._table),
                    func_name=self._delete_polymorphic_function_name(env[self.model_name]),
                ))
        elif self.ondelete == 'prevent':
            for model_name in model_names:
                env.cr.execute(SQL(
                    """
         CREATE OR REPLACE TRIGGER trg_prevent_delete_%(source)s__%(table)s
                    BEFORE DELETE ON %(table)s
                       FOR EACH ROW
                   EXECUTE FUNCTION %(func_name)s()
                    """,
                    source=SQL(env[self.model_name]._table),
                    table=SQL(env[model_name]._table),
                    func_name=self._delete_polymorphic_function_name(env[self.model_name]),
                ))

        elif self.ondelete == 'set null':
            for model_name in model_names:
                env.cr.execute(SQL(
                    """
         CREATE OR REPLACE TRIGGER trg_set_null_delete_%(source)s__%(table)s
                     AFTER DELETE ON %(table)s
                       FOR EACH ROW
                   EXECUTE FUNCTION %(func_name)s()
                    """,
                    source=SQL(env[self.model_name]._table),
                    table=SQL(env[model_name]._table),
                    func_name=self._delete_polymorphic_function_name(env[self.model_name]),
                ))
