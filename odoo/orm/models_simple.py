from __future__ import annotations

import typing

from .fields_relational import Many2one
from .fields_temporal import Datetime
from .models import BaseModel
from .utils import SUPERUSER_ID

if typing.TYPE_CHECKING:
    from .types import ValuesType

# special columns automatically created by the ORM
LOG_ACCESS_COLUMNS = ['create_uid', 'create_date', 'write_uid', 'write_date']
MAGIC_COLUMNS = [*LOG_ACCESS_COLUMNS, 'id']

AbstractModel = BaseModel


class Model(AbstractModel):
    """ Main super-class for regular database-persisted Odoo models.

    Odoo models are created by inheriting from this class::

        class ResUsers(Model):
            ...

    The system will later instantiate the class once per database (on
    which the class' module is installed).
    """
    _auto: bool = True          # automatically create database backend
    _register: bool = False     # not visible in ORM registry, meant to be python-inherited only
    _abstract: typing.Literal[False] = False  # not abstract


class LogAccessMixin(AbstractModel):
    """ Log access class for models.

    Adds fields of last created and last updated user and datetime.
    """
    _register = False           # not visible in ORM registry, meant to be python-inherited only

    create_uid = Many2one('res.users', string='Created by', readonly=True, copy=False)
    create_date = Datetime(string='Created on', readonly=True, copy=False)
    write_uid = Many2one('res.users', string='Last Updated by', readonly=True, copy=False)
    write_date = Datetime(string='Last Updated on', readonly=True, copy=False)

    def get_metadata(self) -> list[ValuesType]:
        res_access = self.read(LOG_ACCESS_COLUMNS)
        res_parent = super().get_metadata()
        for a, b in zip(res_access, res_parent):
            assert a['id'] == b['id']
            a.update(b)
        return res_access

    def write(self, vals):
        # only the superuser can set log_access fields while loading registry
        log_vals = {'write_uid': self.env.uid, 'write_date': self.env.cr.now()}
        if not (self.env.uid == SUPERUSER_ID and not self.pool.ready):
            vals = {key: val for key, val in vals.items() if key not in LOG_ACCESS_COLUMNS}
            if self._has_field_access(self._fields['write_uid'], 'write'):
                vals.update(log_vals)
            else:
                super(LogAccessMixin, self.sudo()).write(log_vals)
        else:
            assert self.env.su
            vals = {**log_vals, **vals}
        return super().write(vals)

    def _write_multi(self, vals_list):
        # set magic fields (already done by write(), but not for computed fields)
        log_vals = {'write_uid': self.env.uid, 'write_date': self.env.cr.now()}
        vals_list = [(log_vals | vals) for vals in vals_list]
        return super()._write_multi(vals_list)

    def _prepare_create_values(self, vals_list):
        # the superuser can set log_access fields while loading registry
        if not vals_list:
            return super()._prepare_create_values(vals_list)
        default_vals = {
            'create_uid': self.env.uid,
            'create_date': self.env.cr.now(),
            'write_uid': self.env.uid,
            'write_date': self.env.cr.now(),
        }
        if not (self.env.uid == SUPERUSER_ID and not self.pool.ready):
            for vals in vals_list:
                vals.update(default_vals)
        else:
            for vals in vals_list:
                for field, value in default_vals.items():
                    vals.setdefault(field, value)
        return super()._prepare_create_values(vals_list)
