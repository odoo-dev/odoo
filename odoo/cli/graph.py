# Part of Odoo. See LICENSE file for full copyright and licensing details.

import fnmatch
import importlib
import inspect
import logging
import optparse
from collections import defaultdict
from collections.abc import Iterable
from itertools import cycle, product

import odoo
from odoo.orm.models import MAGIC_COLUMNS
from odoo.tools import DotDict

from . import Command

_logger = logging.getLogger(__name__)
STYLE = cycle(product(
    ['DarkOliveGreen', 'DarkMagenta', 'DarkSlateBlue', 'DodgerBlue', 'Black', 'GoldenRod'],
    ['solid', 'dashed', 'dotted'],
))

# usage: odoo/odoo-bin graph --addons-path=odoo/addons,enterprise --models="ir.*" -o ~/classes.dot --graph dependencies && xdot ~/classes.dot
# one can also convert to SVG: dot -Tsvg ~/classes.dot > ~/classes.svg


class Graph(Command):
    def run(self, args):
        parser = odoo.tools.config.parser
        group = optparse.OptionGroup(parser, "Graph Configuration")
        group.add_option("--models",
                         dest='model_filter',
                         type='comma',
                         help="Comma separated list of model or pattern (fnmatch)")
        group.add_option("--modules",
                         dest='module_filter',
                         help="Comma separated list of modules")
        group.add_option("--out", "-o",
                         dest='out_file',
                         help="Output file")
        group.add_option("--show_related",
                         dest='show_related',
                         action='store_true',
                         help="Show related fields")
        group.add_option("--graph", dest="graph", help="possible values: dependencies, models")
        parser.add_option_group(group)
        opt = odoo.tools.config.parse_config(args)
        model_filter = opt.model_filter and set(opt.model_filter)
        module_filter = set(opt.module_filter.split(",") if opt.module_filter else odoo.modules.get_modules())
        addons_paths = tuple(opt.addons_path)
        show_related = opt.show_related
        graph = opt.graph
        out_file = opt.out_file
        if not out_file:
            parser.error("Must provide the output file as --out or -o")
        if graph == 'models':
            self._write_model_data(out_file, addons_paths, module_filter, model_filter)
        elif graph == 'dependencies':
            self._write_model_module_dependency(out_file, addons_paths, module_filter)
        else:
            raise optparse.OptionValueError("Invalid argument graph")

    def _write_model_module_dependency(self, out_file, addons_paths, module_filter):
        with open(out_file, 'w+', encoding='utf-8') as file:
            file.write('digraph {')
            for module in get_module_dependencies(addons_paths, module_filter):
                manifest = odoo.modules.get_manifest(module)
                auto_install = manifest.get('auto_install', [])
                if auto_install:
                    file.write(f"{module} [color=red];")
                for dep in manifest.get('depends', []):
                    if auto_install is True or (auto_install and dep in auto_install):
                        file.write(f"{module} -> {dep} [color=red];")
                    else:
                        file.write(f"{module} -> {dep};")
            file.write('}')

    def _write_model_data(self, out_file, addons_paths, module_filter, model_filter):
        data = get_model_data(addons_paths, module_filter, model_filter)
        with open(out_file, 'w+', encoding='utf-8') as file:
            file.write(
                'digraph "classes" {\n'
                'charset="utf-8"\n'
                'layout="fdp"\n'
                'splines=polyline\n'
                'sep="+10,10"\n'
            )
            model_to_id = set()
            relations = set()
            for model_name, fields in data.items():
                model = DotDict(fields.pop('_meta'))
                model_name = model._name.replace('.', '_')
                model_to_id.add(model_name)
                html_fields = []
                for field_name, field in fields.items():
                    field = DotDict(field)
                    name_color = (
                        'lightgreen' if field.related else
                        'lightblue' if field.compute else
                        'white'
                    )
                    type_color = 'lightgray' if field.store else 'white'
                    field_type = field.type
                    if field.required:
                        field_type = f'<B>{field_type}</B>'
                    if field.readonly:
                        field_type = f'<I>{field_type}</I>'
                    if field.relational and field.comodel_name:  # TODO read comodel from related field
                        html_fields.append(f'<TR><TD BGCOLOR="{name_color}" PORT="{field_name}">{field_name}</TD><TD BGCOLOR="{type_color}">{field_type}</TD><TD>{field.comodel_name}</TD></TR>')
                        relations.add((model_name, field_name, field.comodel_name, field.inverse_name))
                    else:
                        html_fields.append(f'<TR><TD BGCOLOR="{name_color}">{field_name}</TD><TD BGCOLOR="{type_color}">{field_type}</TD></TR>')
                html_fields = '\n'.join(html_fields)
                label = f"""<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0">
                    <TR><TD COLSPAN="3" BGCOLOR="yellow">{model._name}</TD></TR>
                    <TR><TD COLSPAN="3" BGCOLOR="lightyellow">{model._description}</TD></TR>
                    {html_fields}
                </TABLE>"""
                file.write(f'{model_name}[label=<{label}>, shape="none", margin=0];\n')
            # for field in list(relations):
            #     if getattr(field, 'inverse_name', None):
            #         inverse = env[field.comodel_name]._fields[field.inverse_name]
            #         if inverse in relations:
            #             relations.remove(inverse)
            for model_name, field_name, comodel_name, inverse_name in relations:
                from_ = model_name.replace('.', '_')
                to = comodel_name.replace('.', '_')
                field_to = inverse_name
                if from_ in model_to_id and to in model_to_id:
                    color, style = next(STYLE)
                    if field_to:
                        file.write(f'{from_}:{field_name}:w -> {to}:{field_to}:w [dir="both" arrowhead="normal", arrowtail="normal", style="{style}", color="{color}"];\n')
                    else:
                        file.write(f'{from_}:{field_name}:w -> {to}:n [arrowhead="normal", arrowtail="none", style="{style}", color="{color}"];\n')
            file.write('}')


def get_model_data(addons_paths, target_modules, models_filter=None):
    models = defaultdict(lambda: defaultdict(dict))
    for model in get_odoo_models(addons_paths, target_modules, models_filter):
        models[model._name]['_meta'].update({
            '_name': model._name,
            '_description': model._description,
        })
        for field_name, field in model.__dict__.items():
            if isinstance(field, odoo.fields.Field):
                if field.name in MAGIC_COLUMNS:
                    continue
                models[model._name][field_name].update({
                    'readonly': field.readonly,
                    'required': field.required,
                    'store': field.store,
                    'type': field.type,
                    'related': field.related,
                    'relational': field.relational,
                    'comodel_name': field.comodel_name or models[model._name][field_name].get('comodel_name'),
                    'inverse_name': isinstance(field, odoo.fields.One2many) and field.inverse_name,
                    'inherited': field.inherited,
                    'compute': bool(field.compute),
                })
    return models


def get_odoo_models(addons_paths, target_modules, models_filter=None):
    for module_name in get_module_dependencies(addons_paths, target_modules):
        yield from _get_odoo_models(module_name, models_filter)


def _get_odoo_models(module_name: str, models_filter: list[str] | None = None):
    """Inspect a python module and yield all odoo models it contains."""
    try:
        unchecked_modules = {importlib.import_module(f'odoo.addons.{module_name}')}
    except (ImportError, FileNotFoundError):
        return
    while unchecked_modules:
        module = unchecked_modules.pop()
        for name, obj in inspect.getmembers(module):
            if inspect.ismodule(obj) and obj.__name__.startswith(module.__name__) and name != 'dp':
                unchecked_modules.add(obj)
            if inspect.isclass(obj) and issubclass(obj, odoo.models.Model):
                if (
                    not obj._abstract
                    and (not models_filter or any(fnmatch.fnmatch(obj._name, match) for match in models_filter))
                ):
                    yield obj


def get_module_dependencies(addons_paths: tuple[str], target_modules: Iterable[str]) -> list[str]:
    """Return the list of all modules that are dependencies of the target modules in order of installation."""
    module2parent = defaultdict(set)
    module2children = defaultdict(set)
    module2children['base']  # init base not having dependencies
    unseen_modules = set(target_modules)
    while unseen_modules:
        module = unseen_modules.pop()
        if not odoo.modules.get_module_path(module).startswith(addons_paths):
            continue
        manifest = odoo.modules.get_manifest(module)
        for dep in manifest.get('depends', []):
            if dep not in module2parent:
                unseen_modules.add(dep)
            module2parent[dep].add(module)
            module2children[module].add(dep)
            for parent in module2parent[module]:
                module2children[parent].add(dep)
    return [module for _depth, module in sorted((len(module2children[module]), module) for module in module2children)]
