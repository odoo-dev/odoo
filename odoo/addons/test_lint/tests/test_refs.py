import ast
import functools
import json
import logging
import os
from collections import Counter

from odoo.modules import Manifest
from odoo.tools import config
from odoo.tools.misc import file_open

from .common import LintCase, RegistryLintCase

_logger = logging.getLogger(__name__)

BASELINE_FILE = 'test_lint/tests/refs_baseline.json'
EXCLUDED_DIRS = {'tests', 'migrations', 'upgrades'}
# a lookup that cannot be declared, as the model of its record belongs to a
# module that is not a dependency
NOQA = '# pylint: disable=ref-literal-xmlid'


@functools.cache
def module_dependencies(module: str) -> frozenset[str]:
    """ Return the modules ``module`` depends on, directly or transitively. """
    manifest = Manifest.for_addon(module, display_warning=False)
    if not manifest:
        return frozenset()
    result = set()
    for dependency in manifest['depends']:
        result.add(dependency)
        result.update(module_dependencies(dependency))
    return frozenset(result)


def iter_module_trees(module: str):
    """ Yield the path and the syntax tree of the python files of ``module``,
    except tests and migrations. """
    manifest = Manifest.for_addon(module, display_warning=False)
    if not manifest:
        return
    for root, dirs, files in os.walk(manifest.path):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for fname in files:
            if fname.endswith('.py'):
                path = os.path.join(root, fname)
                with file_open(path, 'rb') as f:
                    yield path, ast.parse(f.read())


ENV_CHAIN = ('sudo', 'with_context', 'with_company', 'with_user', 'with_env')


def class_model(cls: ast.ClassDef) -> str | None:
    """ Return the name of the model of a model class. """
    names = {}
    for st in cls.body:
        if isinstance(st, ast.Assign) and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name) \
                and isinstance(st.value, ast.Constant) and isinstance(st.value.value, str):
            names[st.targets[0].id] = st.value.value
    return names.get('_name') or names.get('_inherit')


def iter_xmlid_refs(tree: ast.AST):
    """ Yield the calls ``model.ref('module.name')`` with a literal XML ID,
    except ``env.ref()``, with the name of the model if it is known. """
    classes = [cls for cls in ast.walk(tree) if isinstance(cls, ast.ClassDef)]
    owner = {node: cls for cls in classes for node in ast.walk(cls)}
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == 'ref'
            and len(node.args) == 1
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
            and '.' in node.args[0].value
        ):
            continue
        receiver = node.func.value
        while isinstance(receiver, ast.Call) and isinstance(receiver.func, ast.Attribute) and receiver.func.attr in ENV_CHAIN:
            receiver = receiver.func.value
        if (isinstance(receiver, ast.Name) and receiver.id == 'env') or (isinstance(receiver, ast.Attribute) and receiver.attr == 'env'):
            continue
        model = None
        if isinstance(receiver, ast.Subscript) and isinstance(receiver.slice, ast.Constant):
            model = receiver.slice.value
        elif isinstance(receiver, ast.Name) and receiver.id == 'self' and node in owner:
            model = class_model(owner[node])
        yield node, model


class TestRefDeclarations(RegistryLintCase):
    """ Check every models.Ref declaration against the database. """

    def test_ref_declarations(self):
        refs = {}
        for model_name, Model in self.registry.items():
            by_name = {}
            for cls in Model._model_classes__:
                for ref in getattr(cls, '_ref_definitions', ()):
                    refs[id(ref)] = ref
                    other = by_name.setdefault(ref.name, ref)
                    with self.subTest(model=model_name, ref=str(ref)):
                        # redeclaring a reference may redirect it, not change its kind
                        self.assertEqual(
                            (other.model, other.required), (ref.model, ref.required),
                            f"{other} and {ref} have the same name but different kinds",
                        )
        refs = list(refs.values())

        with self.registry.cursor() as cr:
            cr.execute("SELECT module || '.' || name, model FROM ir_model_data WHERE res_id IS NOT NULL")
            xmlid_models = dict(cr.fetchall())

        declared_models = {}
        for ref in refs:
            with self.subTest(ref=str(ref)):
                res_model = xmlid_models.get(ref.xmlid)
                if ref.required:
                    self.assertTrue(res_model, "The XML ID of a required reference does not exist")
                    self.assertIn(
                        ref.xmlid_module, {ref._module, *module_dependencies(ref._module)},
                        f"The module {ref._module} must depend on {ref.xmlid_module} to require its record",
                    )
                if res_model:
                    self.assertEqual(res_model, ref.model, "The XML ID references a record of another model")
                model = declared_models.setdefault(ref.xmlid, ref.model)
                self.assertEqual(model, ref.model, "Another declaration of the same XML ID has another model")
                if ref.required and issubclass(self.registry[ref.model], self.registry['xmlid.mixin']):
                    self.assertTrue(ref.message, "Use ref() on this model instead of declaring a required reference")

    def test_xmlid_refs(self):
        """ Check the calls of ``ref()`` with a literal XML ID on the models
        inheriting ``xmlid.mixin``, in the code of the installed modules. """
        mixin = self.registry['xmlid.mixin']
        with self.registry.cursor() as cr:
            cr.execute("SELECT module || '.' || name, model FROM ir_model_data WHERE res_id IS NOT NULL")
            xmlid_models = dict(cr.fetchall())
            cr.execute("SELECT name FROM ir_module_module WHERE state = 'installed'")
            modules = [name for [name] in cr.fetchall()]

        def is_mixin(model):
            return model in self.registry and issubclass(self.registry[model], mixin)

        for module in modules:
            for path, tree in iter_module_trees(module):
                for node, model in iter_xmlid_refs(tree):
                    xmlid = node.args[0].value
                    res_model = xmlid_models.get(xmlid)
                    if model is not None and not is_mixin(model) and model in self.registry:
                        continue  # another method ref(), like the one of account.chart.template
                    if model is None and not is_mixin(res_model):
                        continue  # not provably a call of xmlid.mixin
                    with self.subTest(path=path, line=node.lineno, xmlid=xmlid):
                        self.assertTrue(res_model, f"The XML ID {xmlid} does not exist")
                        if model is not None:
                            self.assertEqual(res_model, model, "The XML ID references a record of another model")
                        self.assertIn(
                            xmlid.partition('.')[0], {module, *module_dependencies(module)},
                            f"The module {module} must depend on {xmlid.partition('.')[0]} to use its record",
                        )

def iter_literal_refs(tree: ast.AST):
    """ Yield the calls ``env.ref('module.name')`` and ``_xmlid_to_res_id('module.name')``
    with a literal XML ID. """
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
        ):
            continue
        func = node.func
        if func.attr == '_xmlid_to_res_id' or (func.attr == 'ref' and (
            (isinstance(func.value, ast.Name) and func.value.id == 'env')
            or (isinstance(func.value, ast.Attribute) and func.value.attr == 'env')
        )):
            yield node


class TestLiteralRefs(LintCase):
    """ Ratchet on the literal XML ID lookups in business code: their number
    per module may only go down.  Declare a ``models.Ref`` instead, or mark the
    line with ``# pylint: disable=ref-literal-xmlid`` when the model of the
    record is not available to the module.

    When removing lookups, lower the module's count in the baseline file.
    """

    def count_literal_refs(self) -> Counter:
        roots = (
            os.path.join(config.root_path, 'addons'),
            os.path.join(os.path.dirname(config.root_path), 'addons'),
        )
        counts = Counter()
        for manifest in Manifest.all_addon_manifests():
            module = manifest.name
            if module.startswith('test_') or not manifest.path.startswith(roots):
                continue
            for root, dirs, files in os.walk(manifest.path):
                dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
                for fname in files:
                    if not fname.endswith('.py'):
                        continue
                    path = os.path.join(root, fname)
                    with file_open(path, 'rb') as f:
                        tree = ast.parse(f.read())
                    noqa = self.noqa_lines(path, noqa=NOQA)
                    if count := sum(1 for node in iter_literal_refs(tree) if node.lineno not in noqa):
                        counts[module] += count
        return counts

    def test_literal_refs(self):
        with file_open(BASELINE_FILE) as f:
            baseline = json.load(f)
        counts = self.count_literal_refs()
        for module, count in sorted(counts.items()):
            with self.subTest(module=module):
                self.assertLessEqual(
                    count, baseline.get(module, 0),
                    "New literal env.ref() or _xmlid_to_res_id() calls: declare a models.Ref instead",
                )
        if lowered := {module: counts[module] for module, count in baseline.items() if counts[module] < count}:
            _logger.info("Lower the counts of %s in %s", lowered, BASELINE_FILE)
