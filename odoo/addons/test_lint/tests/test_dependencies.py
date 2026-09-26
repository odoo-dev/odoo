from odoo.tests.common import BaseCase, no_retry
import subprocess
import json
import os

from odoo.modules import get_manifest

import logging

_logger = logging.getLogger(__name__)


@no_retry
class TestDocstring(BaseCase):
    def test_dependencies(self):
        # TODO make dynamic
        odoo_path = 'odoo'
        tracked_folders = 'odoo'  # TODO add all addons
        output = "/tmp/odoo_dependencies.json"
        odools_path = "../odoo_ls_server"
        if not os.path.isfile(output):  # TODO remove
            subprocess.call([
                odools_path,
                '--list-python-dependencies',
                '--community-path', odoo_path,
                '--tracked-folders', tracked_folders,
                '-o', output,
            ])
        with open(output, encoding='utf8') as f:
            result = json.load(f)

        cache = {}

        def _get_manifest_dependencies(odoo_addon, python_deps):
            if odoo_addon not in cache:
                manifest = get_manifest(odoo_addon)
                manifest_dependencies = {}
                for external_dependecy_info in manifest['external_dependencies']:
                    if not isinstance(external_dependecy_info, dict):
                        _logger.warning('External dependency %s of %s is not in the correct format in %s/__manifest__.py', external_dependecy_info, odoo_addon, manifest.path)
                        continue
                    unknown_keys = set(external_dependecy_info.keys()) - {'pypi', 'optional', 'test', 'modules', 'apt', 'core'}
                    if unknown_keys:
                        _logger.warning('Unsuported keys %s in external dependencies of %s', sorted(unknown_keys), odoo_addon)
                    python_modules = external_dependecy_info.get('modules', [external_dependecy_info['pypi']])
                    for python_module in python_modules:
                        manifest_dependencies[python_module] = external_dependecy_info

                cache[odoo_addon] = manifest_dependencies
            return cache[odoo_addon]

        for odoo_addon, data in result['modules'].items():
            python_deps = {d['name']: d for d in data['dependencies'] if d['type'] == 'python_module'}
            manifest_dependencies = _get_manifest_dependencies(odoo_addon, python_deps)
            if manifest_dependencies and not any(python_module in python_deps for python_module in manifest_dependencies):
                _logger.warning('Python module %s is not in the dependency of %s but is declared in the manifest', manifest_dependencies, odoo_addon)
            for dep_name, python_dep in python_deps.items():
                manifest_dependency = manifest_dependencies.get(dep_name)
                check_flags = True
                if not manifest_dependency:
                    check_flags = False
                    for odoo_addon_depend in data['manifest_depends']:

                        dependency_name = odoo_addon_depend['name']
                        manifest_dependencies = _get_manifest_dependencies(dependency_name, python_deps)
                        dependent_manifest_dependency = manifest_dependencies.get(dep_name)
                        if (
                            dependent_manifest_dependency and (
                                not manifest_dependency
                                or dependent_manifest_dependency.get('optional') < manifest_dependency.get('optional')
                                or dependent_manifest_dependency.get('test') < manifest_dependency.get('test')
                            )
                        ):
                            manifest_dependency = dependent_manifest_dependency

                if not manifest_dependency:
                    _logger.error('Missing dependency for %s in manifest of module %s', dep_name, odoo_addon)
                    continue
                is_test = True
                is_optional = True
                for occurence in python_dep['occurrences']:
                    o_file = occurence['file']
                    if not '/tests/' in o_file:
                        is_test = False
                        if manifest_dependency.get('test'):
                            _logger.error('Dependency %s in manifest of module %s is marked for dev but is used in %s', dep_name, odoo_addon, o_file)
                    if occurence['import_context'] != 'try':
                        is_optional = False
                        if manifest_dependency.get('optional'):
                            _logger.error('Dependency %s in manifest of module %s is marked for optional but is used in %s outside a try block', dep_name, odoo_addon, o_file)
                if check_flags:
                    if is_test:
                        if not manifest_dependency.get('test'):
                            _logger.warning('Dependency %s in manifest of module %s is not marked as test but is only used in tests', dep_name, odoo_addon)
                    elif is_optional:
                        if not manifest_dependency.get('optional'):
                            _logger.warning('Dependency %s in manifest of module %s is not marked as optional but is only used in try blocks', dep_name, odoo_addon)
