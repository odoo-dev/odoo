# Part of Odoo. See LICENSE file for full copyright and licensing details.

from __future__ import annotations

import logging
import typing
import weakref

from collections import defaultdict
from types import MappingProxyType

from . import models
from . import fields  # must be imported after models
from .utils import check_pg_name
from odoo.exceptions import ValidationError
from odoo.tools import (
    OrderedSet,
    LastOrderedSet,
    frozendict,
    sql,
)
from odoo.tools.safe_eval import safe_checker
from odoo.tools.translate import FIELD_TRANSLATE

if typing.TYPE_CHECKING:
    from odoo.api import Environment
    from odoo.fields import Field
    from odoo.models import BaseModel
    from odoo.modules.registry import Registry

_logger = logging.getLogger('odoo.registry')


SHARED_FIELD_CACHE: weakref.WeakValueDictionary[tuple[str, tuple[Field, ...]], Field] = weakref.WeakValueDictionary()
"""Cache of shared registry field instances keyed by (model_name, definition_fields_tuple)."""

SHARED_MODEL_CACHE: dict[tuple, type[BaseModel]] = {}
"""Cache of shared model classes keyed by their composition (see
:meth:`RegistryModel.get_cache_key`)."""

# THE MODEL DEFINITIONS, MODEL CLASSES, AND MODEL INSTANCES
#
# The framework deals with two kinds of classes for models: the "model
# definitions" and the "model classes".
#
# The "model definitions" are the classes defined in modules source code: they
# define models and extend them.  Those classes are essentially "static", for
# whatever that means in Python.  The only exception is custom models: their
# model definition is created dynamically.
#
# The "model classes" are the ones you find in the registry.  The recordsets of
# a model actually are instances of its model class.  The "model class" of a
# model is created dynamically when the registry is built.  It inherits (in the
# Python sense) from all the model definitions of the model, and possibly other
# model classes (when the model inherits from another model).  It also carries
# model metadata inferred from its parent classes.
#
#
# THE MODEL CLASSES
#
# In the simplest case, a model class inherits from all the classes that define
# the model in a flat hierarchy.  Consider the definitions of model 'a' below.
# The model class of 'a' inherits from the model definitions A1, A2, A3, in
# reverse order, to match the expected overriding order.  The model class
# carries inferred metadata that is shared between all the recordsets of that
# model for a given registry.
#
#       class A(Model):  # A1                 Model
#           _name = 'a'                       / | \
#                                            A3 A2 A1   <- model definitions
#       class A(Model):  # A2                 \ | /
#           _inherit = 'a'                      a       <- model class: registry['a']
#                                               |
#       class A(Model):  # A3                records    <- model instances, like env['a']
#           _inherit = 'a'
#
# Note that when the model inherits from another model, we actually make the
# model classes inherit from each other, so that extensions to an inherited
# model are visible in the model class of the child model, like in the
# following example.
#
#       class A(Model):  # A1
#           _name = 'a'                       Model
#                                            / / \ \
#       class B(Model):  # B1               / /   \ \
#           _name = 'b'                    / A2   A1 \
#                                         B2  \   /  B1
#       class B(Model):  # B2              \   \ /   /
#           _inherit = ['a', 'b']           \   a   /
#                                            \  |  /
#       class A(Model):  # A2                 \ | /
#           _inherit = 'a'                      b
#
# To be more explicit, the parent classes of model 'a' are (A2, A1), and the
# ones of model 'b' are (B2, a, B1).  Consequently, the MRO of model 'a' is
# [a, A2, A1, Model] while the MRO of 'b' is [b, B2, a, A2, A1, B1, Model].
#
#
# THE FIELDS OF A MODEL
#
# The fields of a model are given by the model's definitions, inherited models
# ('_inherit' and '_inherits') and other parties, like custom fields. Note that
# a field can be partially overridden when it appears on several definitions of
# its model.  In that case, the field's final definition depends on the
# presence or absence of each model definition, which itself depends on the
# modules loaded in the registry.
#
# By design, the model class has access to all the fields on its model
# definitions.  When possible, the field is used directly from its model
# definition.  There are a number of cases where the field cannot be used
# directly:
#  - the field is related (and bits may not be shared);
#  - the field is overridden on model definitions;
#  - the field is defined on another model (and accessible by mixin).
#
# The last case prevents sharing the field across registries, because the field
# object is specific to a model, and is used as a key in several key
# dictionaries, like the record cache and pending computations.
#
# Setting up a field on its model definition helps saving memory and time.
# Indeed, when sharing is possible, the field's setup is almost entirely done
# where the field was defined.  It is thus done when the model definition was
# created, and it may be reused across registries.
#
# In the example below, the field 'foo' appears once on its model definition.
# Assuming that it is not related, that field can be set up directly on its
# model definition.  If the model appears in several registries, the
# field 'foo' is effectively shared across registries.
#
#       class A1(Model):                      Model
#           _name = 'a'                        / \
#           foo = ...                         /   \
#           bar = ...                       A2     A1
#                                            bar    foo, bar
#       class A2(Model):                      \   /
#           _inherit = 'a'                     \ /
#           bar = ...                           a
#                                                bar
#
# On the other hand, the field 'bar' is overridden in its model definitions.  In
# that case, the framework recreates the field on the model class, which is
# never shared across registries.  The field's setup will be based on its
# definitions, and will thus not be shared across registries.
#
# The so-called magic fields ('id', 'display_name', ...) used to be added on
# model classes.  But doing so prevents them from being shared.  So instead,
# we add them on definition classes that define a model without extending it.
# This increases the number of fields that are shared across registries.


def discardattr(obj: object, key: str) -> None:
    """ Perform a ``delattr(obj, key)`` but without crashing if ``key`` is not present. """
    try:  # noqa: SIM105
        delattr(obj, key)
    except AttributeError:
        pass


class RegistryModel:
    """ Lightweight per-registry placeholder for a model.

    Instead of creating an actual model class (via ``type(...)``) for every
    model and every registry, we create a ``RegistryModel`` *instance* that
    records the classes the model is composed of (:attr:`_base_classes__`)
    together with the metadata inferred during module loading.  The actual
    model class is built lazily in :func:`_prepare_setup` and may be shared
    across registries through :data:`SHARED_MODEL_CACHE`.
    """
    _pool = True
    """Marker telling this object behaves like a registry model.  It does *not*
    indicate which registry it belongs to."""

    def __init__(self, registry: Registry, name: str, model_def: type[BaseModel]):
        self._registry = registry
        self._name = name
        self._original_module = model_def._module
        self._abstract = model_def._abstract
        self._transient = model_def._transient
        self._auto = model_def._auto
        self._custom = model_def._custom

        self._base_classes__: tuple[RegistryModel | type[BaseModel], ...] = ()
        self._inherit_module: dict[str, str] = {}
        self._description: str | None = name
        self._table: str = name.replace('.', '_')
        self._log_access: bool = self._auto
        self._inherits: dict[str, str] = {}
        self._depends: dict[str, list[str]] = {}

        self._class__: type[BaseModel] | None = None
        self._setup_done__: bool = False

    def get_cache_key(self) -> tuple:
        """ Return a hashable key identifying the composition of this model. """
        return (self._name, *(
            base if getattr(base, '_is_model_definition', False) else base.get_cache_key()
            for base in self._base_classes__
        ))

    @property
    def _shareable(self) -> bool:
        """ Return whether the model composition allows sharing the model class. """
        for base in self._base_classes__:
            if getattr(base, '_is_model_definition', False):
                if not base._shareable:
                    return False
            elif not base._shareable:
                return False
        return True

    def __repr__(self):
        return f"RegistryModel({self._name!r})"


def add_to_registry(registry: Registry, model_def: type[BaseModel]) -> RegistryModel:
    """ Add a model definition to the given registry, and return its
    corresponding registry model.  The actual model class is only built later,
    in :func:`_prepare_setup`.
    """
    assert model_def._is_model_definition

    if hasattr(model_def, '_constraints'):
        _logger.warning("Model attribute '_constraints' is no longer supported, "
                        "please use @api.constrains on methods instead.")
    if hasattr(model_def, '_sql_constraints'):
        _logger.warning("Model attribute '_sql_constraints' is no longer supported, "
                        "please define models.Constraint on the model.")

    # all models except 'base' implicitly inherit from 'base'
    name = model_def._name
    parent_names = list(model_def._inherit)
    if name != 'base':
        parent_names.append('base')

    # create or retrieve the registry model
    if name in parent_names:
        if name not in registry._models:
            raise TypeError(f"Model {name!r} does not exist in registry.")
        model_cls = registry._models[name]
        _check_model_extension(model_cls, model_def)
    else:
        model_cls = RegistryModel(registry, name, model_def)

    # determine all the classes the model should inherit from
    bases = LastOrderedSet([model_def])
    for parent_name in parent_names:
        if parent_name not in registry._models:
            raise TypeError(f"Model {name!r} inherits from non-existing model {parent_name!r}.")
        parent_cls = registry._models[parent_name]
        if parent_name == name:
            for base in parent_cls._base_classes__:
                bases.add(base)
        else:
            _check_model_parent_extension(model_cls, model_def, parent_cls)
            bases.add(parent_cls)
            model_cls._inherit_module[parent_name] = model_def._module
            registry._inherit_children[parent_name].add(name)

    # the resolved bases will be assigned to the actual model class' __bases__
    # in _prepare_setup(); keep the (possibly unresolved) composition here
    model_cls._base_classes__ = tuple(bases)

    # determine the attributes of the registry model
    _init_model_class_attributes(model_cls, registry)

    check_pg_name(model_cls._table)

    # Transience
    if model_cls._transient and not model_cls._log_access:
        raise TypeError(
            "TransientModels must have log_access turned on, "
            "in order to implement their vacuum policy"
        )

    # update the registry after all checks have passed
    registry._models[name] = model_cls

    # mark all impacted models for setup
    for model_name in registry.descendants([name], '_inherit', '_inherits'):
        impacted = registry._models[model_name]
        impacted._setup_done__ = False
        if impacted._class__ is not None:
            impacted._class__._setup_done__ = False
            registry.models.pop(model_name, None)
            impacted._class__ = None

    return model_cls


def _check_model_extension(model_cls: RegistryModel, model_def: type[BaseModel]):
    """ Check whether ``model_cls`` can be extended with ``model_def``. """
    if model_def._table:
        raise TypeError(
            f"{model_def} cannot redefine _table while extending model {model_cls._name!r}. "
            "That class should either remove '_table', or set a different '_name'."
        )
    if model_cls._abstract and not model_def._abstract:
        raise TypeError(
            f"{model_def} transforms the abstract model {model_cls._name!r} into a non-abstract model. "
            "That class should either inherit from AbstractModel, or set a different '_name'."
        )
    if model_cls._transient != model_def._transient:
        if model_cls._transient:
            raise TypeError(
                f"{model_def} transforms the transient model {model_cls._name!r} into a non-transient model. "
                "That class should either inherit from TransientModel, or set a different '_name'."
            )
        else:
            raise TypeError(
                f"{model_def} transforms the model {model_cls._name!r} into a transient model. "
                "That class should either inherit from Model, or set a different '_name'."
            )


def _check_model_parent_extension(model_cls: RegistryModel, model_def: type[BaseModel], parent_cls: RegistryModel):
    """ Check whether ``model_cls`` can inherit from ``parent_cls``. """
    if model_cls._abstract and not parent_cls._abstract:
        raise TypeError(
            f"In {model_def}, abstract model {model_cls._name!r} cannot inherit from non-abstract model {parent_cls._name!r}."
        )


def _init_model_class_attributes(model_cls: RegistryModel, registry: Registry):
    """ Initialize registry model attributes. """
    assert isinstance(model_cls, RegistryModel)

    model_cls._description = model_cls._name
    model_cls._table = model_cls._name.replace('.', '_')
    model_cls._log_access = model_cls._auto
    inherits = {}
    depends = {}

    for base in reversed(model_cls._base_classes__):
        if getattr(base, '_is_model_definition', False):
            # the following attributes are not taken from parent registry models
            if model_cls._name not in base._inherit and not base._description:
                _logger.warning("The model %s has no _description", model_cls._name)
            model_cls._description = base._description or model_cls._description
            model_cls._table = base._table or model_cls._table
            model_cls._log_access = getattr(base, '_log_access', model_cls._log_access)

        inherits.update(base._inherits)

        for mname, fnames in base._depends.items():
            depends.setdefault(mname, []).extend(fnames)

    model_cls._inherits = inherits
    model_cls._depends = depends

    # update _inherits_children of parent models
    for parent_name in model_cls._inherits:
        registry._inherits_children[parent_name].add(model_cls._name)

    # recompute attributes of inherit children models
    for child_name in registry._inherit_children[model_cls._name]:
        _init_model_class_attributes(registry._models[child_name], registry)


def setup_model_classes(env: Environment):
    registry = env.registry

    # we must setup ir.model before adding manual fields because _add_manual_models may
    # depend on behavior that is implemented through overrides, such as is_mail_thread which
    # is implemented through an override to env['ir.model']._instanciate_attrs
    _prepare_setup(registry._models['ir.model'])

    # add manual models
    if registry._init_modules:
        _add_manual_models(env)

    # prepare the setup on all models: resolve (or build) the actual model class
    # for each registry model and store it in registry.models
    registry_models = list(registry._models.values())
    for registry_model in registry_models:
        _prepare_setup(registry_model)

    models_classes = [registry_model._class__ for registry_model in registry_models]

    # do the actual setup
    for model_cls in models_classes:
        _setup(model_cls, env)

    for model_cls in models_classes:
        _setup_fields(model_cls, env)

    for model_cls in models_classes:
        model_cls._fields_update_order__ = {
            field: (field.write_sequence, i)
            for i, field in enumerate(model_cls._fields.values())
        }
        model_cls(env, (), ())._post_model_setup__()


def _prepare_setup(registry_model: RegistryModel) -> type[BaseModel]:
    """ Resolve the actual model class of a registry model. """
    assert isinstance(registry_model, RegistryModel)
    registry = registry_model._registry

    cls = registry_model._class__
    if cls is None:
        resolved_bases = tuple(
            base if getattr(base, '_is_model_definition', False) else _prepare_setup(base)
            for base in registry_model._base_classes__
        )

        if registry_model._shareable:
            cache_key = registry_model.get_cache_key()
            cls = SHARED_MODEL_CACHE.get(cache_key)
            if cls is None:
                cls = _build_model_class(registry_model, resolved_bases)
                SHARED_MODEL_CACHE[cache_key] = cls
        else:
            cls = _build_model_class(registry_model, resolved_bases)

        registry_model._class__ = cls
        registry.models[registry_model._name] = cls

    if cls._setup_done__:
        assert cls.__bases__ == cls._base_classes__
    else:
        if cls.__bases__ != cls._base_classes__:
            cls.__bases__ = cls._base_classes__

        for attr in ('_rec_name', '_active_name'):
            discardattr(cls, attr)

        cls._constraint_methods = models.BaseModel._constraint_methods
        cls._ondelete_methods = models.BaseModel._ondelete_methods
        cls._onchange_methods = models.BaseModel._onchange_methods

    return cls


def _build_model_class(registry_model: RegistryModel, resolved_bases: tuple) -> type[BaseModel]:
    """ Build the actual model class for the given registry model. """
    name = registry_model._name
    cls = type(name, resolved_bases, {
        '_is_model_definition': False,
        '_name': name,
        '_register': False,
        '_original_module': registry_model._original_module,
        '_inherit_module': dict(registry_model._inherit_module),
        '_base_classes__': resolved_bases,
        '_setup_done__': False,
        '_fields__': {},
        '_fields_update_order__': {},
        '_table_objects': frozendict(),
    })
    cls._fields = MappingProxyType(cls._fields__)

    cls._description = registry_model._description
    cls._table = registry_model._table
    cls._log_access = registry_model._log_access
    if registry_model._inherits:
        cls._inherits = dict(registry_model._inherits)
    if registry_model._depends:
        cls._depends = {mname: list(fnames) for mname, fnames in registry_model._depends.items()}

    safe_checker.add_hook(cls, None)
    return cls


def _setup(model_cls: type[BaseModel], env: Environment):
    """ Determine all the fields of the model. """
    if model_cls._setup_done__:
        return

    # the classes that define this model, i.e., the ones that are not
    # registry classes; the purpose of this attribute is to behave as a
    # cache of [c for c in model_cls.mro() if c._is_model_definition], which
    # is heavily used in function fields.resolve_mro()
    model_cls._model_classes__ = tuple(c for c in model_cls.mro() if getattr(c, '_is_model_definition', False))

    # 1. determine the proper fields of the model: the fields defined on the
    # class and magic fields, not the inherited or custom ones

    # retrieve fields from parent classes, and duplicate them on model_cls to
    # avoid clashes with inheritance between different models
    for name in model_cls._fields:
        discardattr(model_cls, name)
    model_cls._fields__.clear()

    # collect the definitions of each field (base definition + overrides)
    definitions = defaultdict(list)
    for cls in reversed(model_cls._model_classes__):
        for field in cls._field_definitions:
            definitions[field.name].append(field)

    for name, fields_ in definitions.items():
        if f'{model_cls._name}.{name}' in env.registry._database_translated_fields:
            # the field is currently translated in the database; ensure the
            # field is translated to avoid converting its column to varchar
            # and losing data
            translate = next((
                field._args__['translate'] for field in reversed(fields_) if 'translate' in field._args__
            ), False)
            if not translate:
                field_translate = FIELD_TRANSLATE.get(
                    env.registry._database_translated_fields[f'{model_cls._name}.{name}'],
                    True
                )
                # patch the field definition by adding an override
                _logger.debug("Patching %s.%s with translate=True", model_cls._name, name)
                fields_.append(type(fields_[0])(translate=field_translate))
        if f'{model_cls._name}.{name}' in env.registry._database_company_dependent_fields:
            # the field is currently company dependent in the database; ensure
            # the field is company dependent to avoid converting its column to
            # the base data type
            company_dependent = next((
                field._args__['company_dependent'] for field in reversed(fields_) if 'company_dependent' in field._args__
            ), False)
            if not company_dependent:
                # validate column type again in case the column type is changed by upgrade script
                rows = env.execute_query(sql.SQL(
                    'SELECT data_type FROM information_schema.columns'
                    ' WHERE table_name = %s AND column_name = %s AND table_schema = current_schema',
                    model_cls._table, name,
                ))
                if rows and rows[0][0] == 'jsonb':
                    # patch the field definition by adding an override
                    _logger.debug("Patching %s.%s with company_dependent=True", model_cls._name, name)
                    fields_.append(type(fields_[0])(company_dependent=True))
        if all(field._shareable for field in fields_):
            if len(fields_) == 1 and fields_[0].model_name == model_cls._name:
                model_cls._fields__[name] = fields_[0]
            else:
                cache_key = (model_cls._name, tuple(fields_))
                if (field_ := SHARED_FIELD_CACHE.get(cache_key)) is None:
                    Field = type(fields_[-1])
                    field_ = Field(_base_fields__=tuple(fields_))
                    SHARED_FIELD_CACHE[cache_key] = field_
                add_field(model_cls, name, field_, env, shareable=True)
        else:
            Field = type(fields_[-1])
            add_field(model_cls, name, Field(_base_fields__=tuple(fields_)), env)

    # 2. add manual fields
    if env.registry._init_modules:
        _add_manual_fields(model_cls, env)

    # 3. make sure that parent models determine their own fields, then add
    # inherited fields to model_cls
    _check_inherits(model_cls)
    for parent_name in model_cls._inherits:
        _setup(env.registry[parent_name], env)
    _add_inherited_fields(model_cls, env)

    # 4. initialize more field metadata
    model_cls._setup_done__ = True

    for field in model_cls._fields.values():
        field.prepare_setup()

    # 5. determine and validate rec_name
    if model_cls._rec_name:
        assert model_cls._rec_name in model_cls._fields, \
            "Invalid _rec_name=%r for model %r" % (model_cls._rec_name, model_cls._name)
    elif 'name' in model_cls._fields:
        model_cls._rec_name = 'name'
    elif model_cls._custom and 'x_name' in model_cls._fields:
        model_cls._rec_name = 'x_name'

    # 6. determine and validate active_name
    if model_cls._active_name:
        assert (model_cls._active_name in model_cls._fields
                and model_cls._active_name in ('active', 'x_active')), \
            ("Invalid _active_name=%r for model %r; only 'active' and "
            "'x_active' are supported and the field must be present on "
            "the model") % (model_cls._active_name, model_cls._name)
    elif 'active' in model_cls._fields:
        model_cls._active_name = 'active'
    elif 'x_active' in model_cls._fields:
        model_cls._active_name = 'x_active'

    # 7. determine table objects
    assert not model_cls._table_object_definitions, "model_cls is a registry model"
    model_cls._table_objects = frozendict({
        cons.full_name(model_cls): cons
        for cls in reversed(model_cls._model_classes__)
        if isinstance(cls, models.MetaModel)
        for cons in cls._table_object_definitions
    })


def _check_inherits(model_cls: type[BaseModel]):
    for comodel_name, field_name in model_cls._inherits.items():
        field = model_cls._fields.get(field_name)
        if not field or field.type != 'many2one':
            raise TypeError(
                f"Missing many2one field definition for _inherits reference {field_name!r} in model {model_cls._name!r}. "
                f"Add a field like: {field_name} = fields.Many2one({comodel_name!r}, required=True, ondelete='cascade')"
            )
        if not (field.delegate and field.required and (field.ondelete or "").lower() in ("cascade", "restrict")):
            raise TypeError(
                f"Field definition for _inherits reference {field_name!r} in {model_cls._name!r} "
                "must be marked as 'delegate', 'required' with ondelete='cascade' or 'restrict'"
            )


def _add_inherited_fields(model_cls: type[BaseModel], env: Environment):
    """ Determine inherited fields. """
    if model_cls._abstract or not model_cls._inherits:
        return

    # determine which fields can be inherited
    to_inherit = {
        name: (parent_fname, field)
        for parent_model_name, parent_fname in model_cls._inherits.items()
        for name, field in env.registry[parent_model_name]._fields.items()
    }

    # add inherited fields that are not redefined locally
    for name, (parent_fname, field) in to_inherit.items():
        if name not in model_cls._fields:
            # inherited fields are implemented as related fields, with the
            # following specific properties:
            #  - reading inherited fields should not bypass access rights
            #  - copy inherited fields iff their original field is copied
            field_cls = type(field)
            add_field(model_cls, name, field_cls(
                inherited=True,
                inherited_field=field,
                related=f"{parent_fname}.{name}",
                related_sudo=False,
                copy=field.copy,
                readonly=field.readonly,
                export_string_translation=field.export_string_translation,
            ), env)


def _setup_fields(model_cls: type[BaseModel], env: Environment):
    """ Setup the fields, except for recomputation triggers. """
    bad_fields = []
    many2one_company_dependents = env.registry.many2one_company_dependents
    model = model_cls(env, (), ())
    for name, field in model_cls._fields.items():
        try:
            field.setup(model)
        except Exception:
            if field.base_field.manual:
                # Something goes wrong when setup a manual field.
                # This can happen with related fields using another manual many2one field
                # that hasn't been loaded because the comodel does not exist yet.
                # This can also be a manual function field depending on not loaded fields yet.
                bad_fields.append(name)
                continue
            raise
        if field.type == 'many2one' and field.company_dependent:
            many2one_company_dependents.add(field.comodel_name, field)

    for name in bad_fields:
        pop_field(model_cls, name, env)


def _add_manual_models(env: Environment):
    """ Add extra models to the registry. """
    # clean up registry first
    removed_fields = OrderedSet()
    for name, registry_model in list(env.registry._models.items()):
        if registry_model._custom:
            if registry_model._class__ is not None:
                removed_fields.update(registry_model._class__._fields.values())
            del env.registry._models[name]
            env.registry.models.pop(name, None)
            for children in env.registry._inherit_children.values():
                children.discard(name)
            env.registry._inherit_children.pop(name, None)
            for children in env.registry._inherits_children.values():
                children.discard(name)
            env.registry._inherits_children.pop(name, None)

    if removed_fields:
        env.registry._discard_fields(list(removed_fields))

    # we cannot use self._fields to determine translated fields, as it has not been set up yet
    env.cr.execute("SELECT *, name->>'en_US' AS name FROM ir_model WHERE state = 'manual'")
    for model_data in env.cr.dictfetchall():
        attrs = env['ir.model']._instanciate_attrs(model_data)

        # adapt _auto and _log_access if necessary
        table_name = model_data["model"].replace(".", "_")
        table_kind = sql.table_kind(env.cr, table_name)
        if table_kind not in (sql.TableKind.Regular, None):
            _logger.info(
                "Model %r is backed by table %r which is not a regular table (%r), disabling automatic schema management",
                model_data["model"], table_name, table_kind,
            )
            attrs['_auto'] = False
            env.cr.execute(
                """ SELECT a.attname
                    FROM pg_attribute a
                    JOIN pg_class t ON a.attrelid = t.oid AND t.relname = %s
                    WHERE a.attnum > 0 -- skip system columns
                    AND t.relnamespace = current_schema::regnamespace """,
                [table_name]
            )
            columns = {colinfo[0] for colinfo in env.cr.fetchall()}
            attrs['_log_access'] = set(models.LOG_ACCESS_COLUMNS) <= columns

        model_def = type('CustomDefinitionModel', (models.Model,), attrs)
        add_to_registry(env.registry, model_def)


def _add_manual_fields(model_cls: type[BaseModel], env: Environment):
    """ Add extra fields on model. """
    IrModelFields = env['ir.model.fields']

    fields_data = IrModelFields._get_manual_field_data(model_cls._name)
    for name, field_data in fields_data.items():
        if name not in model_cls._fields and field_data['state'] == 'manual':
            try:
                attrs = IrModelFields._instanciate_attrs(field_data)
                if attrs:
                    field = fields.Field._by_type__[field_data['ttype']](**attrs)
                    add_field(model_cls, name, field, env)
            except Exception:
                _logger.exception("Failed to load field %s.%s: skipped", model_cls._name, field_data['name'])


def add_field(model_cls: type[BaseModel], name: str, field: Field, env: Environment, shareable: bool = False):
    """Add ``field`` to ``model_cls`` under ``name`` and set its _shareable flag."""
    # Assert the name is an existing field in the model, or any model in the _inherits
    # or a custom field (starting by `x_`)
    is_class_field = any(
        isinstance(getattr(model, name, None), fields.Field)
        for model in [model_cls] + [env.registry[inherit] for inherit in model_cls._inherits]
    )
    if not (is_class_field or env.registry['ir.model.fields']._is_manual_name(None, name)):
        raise ValidationError(  # pylint: disable=missing-gettext
            f"The field `{name}` is not defined in the `{model_cls._name}` Python class and does not start with 'x_'"
        )

    # Assert the attribute to assign is a Field
    if not isinstance(field, fields.Field):
        raise ValidationError("You can only add `fields.Field` objects to a model fields")  # pylint: disable=missing-gettext

    if not isinstance(getattr(model_cls, name, field), fields.Field):
        _logger.warning("In model %r, field %r overriding existing value", model_cls._name, name)
    setattr(model_cls, name, field)
    if field._shareable != shareable:
        field._shareable = shareable
    field.__set_name__(model_cls, name)
    # add field as an attribute and in model_cls._fields__ (for reflection)
    model_cls._fields__[name] = field


def pop_field(model_cls: type[BaseModel], name: str, env: Environment) -> Field | None:
    """ Remove the field with the given ``name`` from the model class of ``model``. """
    field = model_cls._fields__.pop(name, None)
    discardattr(model_cls, name)
    if model_cls._rec_name == name:
        # fixup _rec_name and display_name's dependencies
        model_cls._rec_name = None
        registry = env.registry
        if model_cls.display_name in registry.field_depends:
            registry.field_depends[model_cls.display_name] = tuple(
                dep for dep in registry.field_depends[model_cls.display_name] if dep != name
            )
    return field
