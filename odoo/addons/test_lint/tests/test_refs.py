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
                    self.assertIn(ref.model, self.registry, "The declared model is not installed")
                    self.assertTrue(res_model, "The XML ID of a required reference does not exist")
                    self.assertIn(
                        ref.xmlid_module, {ref._module, *module_dependencies(ref._module)},
                        f"The module {ref._module} must depend on {ref.xmlid_module} to require its record",
                    )
                if res_model:
                    self.assertEqual(res_model, ref.model, "The XML ID references a record of another model")
                model = declared_models.setdefault(ref.xmlid, ref.model)
                self.assertEqual(model, ref.model, "Another declaration of the same XML ID has another model")


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
    per module may only go down.  Declare a ``models.Ref`` instead.

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
                    with file_open(os.path.join(root, fname), 'rb') as f:
                        tree = ast.parse(f.read())
                    if count := sum(1 for _node in iter_literal_refs(tree)):
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
