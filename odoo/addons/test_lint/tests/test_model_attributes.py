import inspect

from odoo import api
from .common import RegistryLintCase

DEPRECATED_MODEL_ATTRIBUTES = [
    ('view_init', ''),
    ('_needaction', ''),
    ('_sql', "check _table or _table_sql"),
    ('_table_query', "overwrite _table_sql"),
    ('_execute_sql', "use self.env.execute_query"),
    ('name_get', "overwrite `_compute_display_name`")
]


class TestModelDeprecations(RegistryLintCase):
    failureException = TypeError

    def test_model_attributes(self):
        for model_name, Model in self.registry.items():
            for attr, detail_message in DEPRECATED_MODEL_ATTRIBUTES:
                with self.subTest(model=model_name, attr=attr):
                    value = getattr(Model, attr, None)
                    if value is None:
                        continue
                    msg = f"Deprecated method/attribute {model_name}.{attr}"
                    module = inspect.getmodule(value)
                    if module:
                        msg += f" in {module}"
                    if detail_message:
                        msg += ", " + detail_message
                    self.fail(msg)

    def test_parameter_rpc_compatible(self):
        """Parameters "ids" and "context" are not allowed in public methods.
        These conflict with standard parameters used in RPC calls.
        """
        INVALID_NAMES = {'ids', 'context'}
        for model_name, model_cls in self.registry.items():
            for method_name, method in inspect.getmembers(model_cls, inspect.isroutine):
                if method_name.startswith('_') or getattr(method, '_api_private', False):
                    continue

                with self.subTest(model=model_name, method=method_name):
                    signature = inspect.signature(method)
                    self.assertFalse(INVALID_NAMES.intersection(signature.parameters), "Invalid parameter names found")

    def test_aggregation_vs_composition(self):
        composition_fields = [
            field
            for model_cls in self.registry.values()
            if not model_cls._abstract and not model_cls._transient
            for field in model_cls._fields.values()
            if field.type == 'many2one' and field.required and field.ondelete == 'cascade'
        ]
        import logging
        _logger = logging.getLogger(__name__)
        import ast
        from odoo.fields import Domain
        def parse_domain(d):
            if d:
                d = d.strip()
            if not d:
                return Domain.TRUE
            try:
                return Domain(ast.literal_eval(d))
            except ValueError:
                return None
        with self.registry.cursor() as cr:
            env = api.Environment(cr, api.SUPERUSER_ID, {})
            access_by_model = env['ir.access'].search([('for_read', '=', True)]).grouped(lambda a: a.model_id.model)
            for field in composition_fields:
                accesses = access_by_model.get(field.model_name) or env['ir.access']
                domains = [parse_domain(a.domain) for a in accesses]
                if all(d is None or d.is_true() for d in domains):
                    continue
                has_inverse = self.registry.field_inverses[field]
                has_bypass = all(i.bypass_search_access for i in has_inverse)
                if not has_bypass:
                    _logger.warning("%s %s: no bypass on inverse", field, has_inverse)
                if all(d is None or d.is_true() or d.is_condition(field_expr=field.name, operator='access') for d in domains):
                    continue
                _logger.warning("%s %s: %s", field, has_inverse, accesses.mapped('domain'))
