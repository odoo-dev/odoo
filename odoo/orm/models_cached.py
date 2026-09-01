# Part of Odoo. See LICENSE file for full copyright and licensing details.

from typing import Self

from odoo.tools import frozendict, OrderedSet

from .domains import Domain, DomainCondition
from .models import Model, api


class CachedModel(Model):
    """ The abstract model 'ir.cached.data' is used as a mixin to provide a stable
    cache for some fields of the model's records.  It uses the cache named
    ``'stable'`` and automatically invalidates it based on ``_clear_cache_name``.
    """
    _register: bool = False  # not visible in ORM registry, meant to be Python-inherited only

    _clear_cache_name = 'stable'

    _cached_data_domain = []
    """domain of the records to cache"""

    _cached_data_fields: tuple[str] = ()
    """the fields to cache for the records to cache. Please promise all these
    fields don't depend on other models and context and are not translated."""

    @property
    def _clear_cache_on_fields(self):
        return self._cached_data_fields

    @api.ormcache(cache='stable')
    def _cached_data(self) -> frozendict:
        """ Return the cached values for all records that satisfy ``_cached_data_domain``.
        The result is a mapping where keys are field names (including field ``id``)
        and values are tuples of cached values.
        """
        fnames = self._cached_data_fields
        assert fnames, "missing fields to cache"
        records = self.sudo().with_context({'active_test': False}).search_fetch(
            self._cached_data_domain, fnames, order='id')

        # each field is mapped to a tuple
        result = {'id': OrderedSet(records._ids)}
        for fname in fnames:
            field_cache = self._fields[fname]._get_cache(records.env)
            result[fname] = tuple(map(field_cache.__getitem__, records.ids))
        return frozendict(result)

    def _fetch_field(self, field):
        if any(self._ids) and field.name in self._cached_data_fields:
            self.check_field_access(field, 'read')
            data = self._cached_data()
            field._insert_cache(self.browse(data['id']), data[field.name])
            if all(record_id in data['id'] for record_id in self._ids):
                self.check_access('read')
                return
        super()._fetch_field(field)

    @api.model
    @api.private
    def get_all(self) -> Self:
        """Get all instances in cache."""
        return self.browse(self._cached_data()['id'])

    def _search(self, domain, *args, **kwargs):
        domain = Domain(domain).optimize(self)
        match domain:
            case DomainCondition(field_expr='id', operator='in', value=ids):
                if set(ids) <= self._cached_data()['id']:
                    return self.browse(ids)._as_query()
        return super()._search(domain, *args, **kwargs)
