# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.fields import Domain
from odoo.tools import SQL, Query


def _text_search_index_sql(registry):
    # XXX needs extension
    vector = registry[self._name]._text_search_vector_sql('t', None)
    return f"USING gin ({vector})"


class TextSearchMixin(models.AbstractModel):
    _name = 'text.search.mixin'
    _description = "Text Search Mixin"
    _text_search_dictionary = 'english'
    # 16 divides the rank by 1 + the logarithm of the number of unique words in document
    # 32 divides the rank by itself + 1 (to normalize results)
    _text_search_normalization = 16 | 32

    _text_search_gin_index = models.Index(_text_search_index_sql)

    text_search = fields.Float(
        compute="_compute_full_text_search",
        search="_search_full_text_search",
        compute_sudo=True,
    )

    def _text_search_vector_sql(self, alias, query):
        assert 'text_search' not in self._rec_names_search
        # XXX add unaccent
        field_concat = SQL(" || '  ' || ").join(
            self._field_to_sql(alias, field.name)  # ignore query, all should be in the table
            for fn in self._rec_names_search
            if (field := self._fields[fn])
        )
        return SQL("to_tsvector(%s, %s)", self._text_search_dictionary, field_concat)

    def _compute_full_text_search(self):
        self.text_search = False

    def _search_full_text_search(self, operator, value):
        if operator != 'ilike':
            if operator == 'not ilike':
                return self._search_full_text_search('ilike', f'! ({value})')
            raise NotImplementedError("only implemented ilike")

        def to_sql(model, alias, query):
            return SQL("%s @@ %s", model._text_search_vector_sql(alias, query), value)
        return Domain.custom(to_sql=to_sql)

    def _order_field_to_sql(self, alias: str, field_name: str, direction: SQL,
                            nulls: SQL, query: Query) -> SQL:
        """ Return an :class:`SQL` object that represents the ordering by the
        given field.  The method also checks whether the field is accessible for
        reading.

        :param direction: one of ``SQL("ASC")``, ``SQL("DESC")``, ``SQL()``
        :param nulls: one of ``SQL("NULLS FIRST")``, ``SQL("NULLS LAST")``, ``SQL()``
        """
        # field_name is an expression
        if field_name != 'text_search':
            return super()._order_field_to_sql(alias, field_name, direction, nulls, query)

        vector = self._text_search_vector_sql(alias, query)
        # XXX ugly way of finding the query
        where = query.where_clause
        pos = where.code.index('@@')
        skip_params = where.code[:pos].count('%s')
        search_query = where.params[skip_params]
        desc = SQL("DESC")
        direction = SQL("ASC") if direction == desc else desc
        return SQL("ts_rank(%s, %s, %s) %s %s", vector, search_query, self._text_search_normalization, direction, nulls)
