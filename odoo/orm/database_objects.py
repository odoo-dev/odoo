from __future__ import annotations

import re
import typing
import warnings

from odoo.tools import sql

if typing.TYPE_CHECKING:
    from collections.abc import Callable

    import psycopg2.extensions

    from .environments import Environment
    from .models import BaseModel

    ConstraintMessageType = (
        str
        | Callable[[Environment, psycopg2.extensions.Diagnostics | None], str]
    )


class DatabaseObject:
    """ Declares a SQL object related to the model.

    The name of the SQL object will be "{model._table}_{key}".
    """
    key: str
    message: ConstraintMessageType = ''

    def __init__(self):
        """Abstract SQL object"""
        self.key = ''

    def __set_name__(self, owner, name):
        self.key = name

    @property
    def definition(self) -> str:
        raise NotImplementedError

    def full_name(self, model: BaseModel) -> str:
        assert self.key, f"The SQL object is not named ({self.definition})"
        name = f"{model._table}_{self.key}"
        return sql.make_identifier(name)

    def get_error_message(self, model: BaseModel, diagnostics=None) -> str:
        """Build an error message for the object/constraint.

        :param model: Optional model on which the constraint is defined
        :param diagnostics: Optional diagnostics from the raised exception
        :return: Translated error for the user
        """
        message = self.message
        if callable(message):
            return message(model.env, diagnostics)
        return message

    def sync_database_object(self, model: BaseModel):
        raise NotImplementedError

    def __str__(self) -> str:
        return f"({self.key!r}={self.definition!r}, {self.message!r})"


class Constraint(DatabaseObject):
    """ SQL table constraint.

    The definition of the constraint is used to `ADD CONSTRAINT` on the table.
    """
    _FOREIGN_KEY_RE = re.compile(r'\sforeign\s+key\b.*', re.IGNORECASE)

    def __init__(
        self,
        definition: str,
        message: ConstraintMessageType = '',
    ) -> None:
        """ SQL table containt.

        The definition is the SQL that will be used to add the constraint.
        If the constraint is violated, we will show the message to the user
        or an empty string to get a default message.

        Examples of constraint definitions:
        - CHECK (x > 0)
        - FOREIGN KEY (abc) REFERENCES some_table(id)
        - UNIQUE (user_id)
        """
        super().__init__()
        self._definition = definition
        if message:
            self.message = message
        if self._FOREIGN_KEY_RE.match(definition):
            self._type = 'FK'
        elif not definition:
            self._type = 'VIRTUAL'
        else:
            self._type = 'CONSTRAINT'

    @property
    def definition(self):
        return self._definition

    def sync_database_object(self, model: BaseModel):
        cr = model.env.cr
        conname = self.full_name(model)
        definition = self.definition
        current_definition = sql.constraint_definition(cr, model._table, conname)
        if current_definition == definition:
            return

        if current_definition:
            # constraint exists but its definition may have changed
            sql.drop_constraint(cr, model._table, conname)

        if self._type == 'VIRTUAL':
            # virtual constraint (e.g. implemented by a custom index)
            warnings.warn(f"Since 19.0, stop using virtual constraints, give a proper defintion like INDEX for '{conname}'", DeprecationWarning)
            model.pool.post_init(sql.check_index_exist, cr, conname)
        elif self._type == "FK":
            model.pool.post_init(sql.add_constraint, cr, model._table, conname, definition)
        else:
            model.pool.post_constraint(sql.add_constraint, cr, model._table, conname, definition)


class Index(DatabaseObject):
    """ Index on the table.

    ``CREATE INDEX ... ON model_table <your definition>``.
    """
    unique: bool = False

    def __init__(self, definition: str):
        """ Index in SQL.

        The name of the SQL object will be "{model._table}_{key}". The definition
        is the SQL that will be used to create the constraint.

        Example of definition:
        - (group_id, active) WHERE active IS TRUE
        - USING btree (group_id, user_id)
        """
        super().__init__()
        self._index_definition = definition

    @property
    def definition(self):
        return f"{'UNIQUE ' if self.unique else ''}INDEX {self._index_definition}"

    def sync_database_object(self, model: BaseModel):
        cr = model.env.cr
        conname = self.full_name(model)
        definition = self.definition
        current_definition = sql.index_definition(cr, conname)
        if current_definition == definition:
            return

        if current_definition:
            # constraint exists but its definition may have changed
            sql.drop_index(cr, conname, model._table)

        definition_clause = self._index_definition
        model.pool.post_constraint(
            sql.add_index,
            cr,
            conname,
            model._table,
            comment=definition,
            definition=definition_clause,
            unique=self.unique,
        )


class UniqueIndex(Index):
    """ Unique index on the table.

    ``CREATE UNIQUE INDEX ... ON model_table <your definition>``.
    """
    unique = True

    def __init__(self, definition: str, message: ConstraintMessageType = ''):
        """ Unique index in SQL.

        The name of the SQL object will be "{model._table}_{key}". The definition
        is the SQL that will be used to create the constraint.
        You can also specify a message to be used when constraint is violated.

        Example of definition:
        - (group_id, active) WHERE active IS TRUE
        - USING btree (group_id, user_id)
        """
        super().__init__(definition)
        if message:
            self.message = message
