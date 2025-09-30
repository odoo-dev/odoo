from __future__ import annotations

import typing

from odoo.tools.misc import OrderedSet, SENTINEL, Sentinel
from odoo.tools import SQL

from .fields import Field, _logger
from .utils import COLLECTION_TYPES, SQL_OPERATORS

if typing.TYPE_CHECKING:
    from .models import BaseModel
from odoo.tools import Query


class TextSearch(Field[None]):
    source_fields: tuple[str, ...] = ()
    dictionary = 'english'
    # 16 divides the rank by 1 + the logarithm of the number of unique words in document
    # 32 divides the rank by itself + 1 (to normalize results)
    normalization = 16 | 32

    readonly = True
    store = False

    type = 'text_search'
    _column_type = ('tsvector', 'tsvector')

    def __init__(self, **kwargs):
        kwargs.update({
            'compute': self.compute,
            'compute_sudo': True,
            'readonly': True,
            'search': self.search,
            'store': False,
            'string': "Search Field",
        })
        super().__init__(**kwargs)

    def compute(self, model):
        pass

    def search(self, model, operator, value):
        if operator != 'ilike':
            if operator == 'not ilike':
                return self.search(model, 'ilike', f'! ({value})')
            raise NotImplementedError("only implemented ilike")
        return [(self.name, 'ilike', value)]

    def _to_sql_vector(self, model, alias, query):
        field_concat = SQL(" || '  ' || ").join(
            model._field_to_sql(alias, field.name, query)
            for fn in self.source_fields
            if (field := model._fields[fn])
        )
        return SQL("to_tsvector(%s, %s)", self.dictionary, field_concat, to_flush=self)

    def to_sql(self, model, alias):  # XXX add query
        query = Query(model.env, alias, None)  # XXX
        vector = self._to_sql_vector(model, alias, query)
        search_query = 'abc'  # XXX find value in query (value after self flushed)
        return SQL("-ts_rank(%s, %s, %s)", vector, search_query, self.normalization)

    def condition_to_sql(self, field_expr: str, operator: str, value, model: BaseModel, alias: str, query: Query) -> SQL:
        return SQL("%s @@ %s", self._to_sql_vector(model, alias, query), value)
