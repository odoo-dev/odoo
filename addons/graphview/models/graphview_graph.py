from collections import defaultdict

from odoo import models, fields, api
from odoo.tools import lazy_property

from typing import Set, Dict, Tuple, Iterable, Iterator


class lazy_recursive_property(lazy_property):
    """
    a non-thread-safe lazy recursive property
    """

    def __get__(self, obj, cls):
        if obj is None:
            return self
        _visited = f'_{self.fget.__name__}_visited'
        if getattr(obj, _visited, False):
            raise RecursionError()
        setattr(obj, _visited, True)
        value = self.fget(obj)
        delattr(obj, _visited)
        setattr(obj, self.fget.__name__, value)
        return value


class Package:
    """
    Python package for the Odoo module with the same name
    """
    def __init__(self, name: str, package_graph: 'PackageGraph') -> None:
        # manifest data
        self.name = name

        # dependency
        self.depends: Set[Package] = set()
        self.package_graph = package_graph

    @lazy_recursive_property
    def depth(self) -> int:
        """ Return the longest distance from self to module 'base' along dependencies. """
        return max(package.depth for package in self.depends) + 1 if self.depends else 0

    @property
    def loading_sort_key(self) -> Tuple[int, str]:
        return self.depth, self.name


class PackageGraph:
    """
    Sorted Python packages for Odoo modules with the same names ordered by (package.phase, package.depth, package.name)
    """

    def __init__(self, dependencies) -> None:
        self._packages: Dict[str, Package] = {}
        self.dependencies = dependencies
        self._sort_key = lambda package: package.loading_sort_key

        for name in dependencies:
            self._packages[name] = Package(name, self)

        for name in dependencies:
            package = self._packages[name]
            package.depends = set(self._packages[dep] for dep in self.dependencies[package.name])

    def __getitem__(self, name: str) -> Package:
        return self._packages[name]

    def __iter__(self) -> Iterator[Package]:
        return iter(sorted(self._packages.values(), key=self._sort_key))

    def __len__(self) -> int:
        return len(self._packages)


class GraphviewGraph(models.Model):
    _name = 'graphview.graph'
    _description = 'Graph View'

    name = fields.Char(string='Name', required=True)
    nodes = fields.Json(string='Nodes')
    edges = fields.Json(string='Edges')
    stylesheet = fields.Json(string='Stylesheet')
    layout = fields.Json(string='Layout', default={'name': 'preset'})
    graphdata = fields.Json(string='Graph Data', compute='_compute_graphdata')

    @api.depends('nodes', 'edges', 'stylesheet')
    def _compute_graphdata(self):
        for record in self:
            record.graphdata = {
                'layout': record.layout or {},
                'elements': {
                    'nodes': record.nodes or [],
                    'edges': record.edges or [],
                },
                'style': record.stylesheet or [],
            }

    @api.model
    def create_module_dep(self):
        modules = self.env['ir.module.module'].search([])
        dependencies = {module.name: set() for module in modules}
        self.env.cr.execute("SELECT m.name, d.name FROM ir_module_module_dependency d JOIN ir_module_module m ON d.module_id = m.id")
        for module, dependency in self.env.cr.fetchall():
            dependencies[module].add(dependency)

        # Filter out test modules and ensure 'base' is a dependency if no dependencies exist
        dependencies = {k: v for k, v in dependencies.items() if not k.startswith('test_')}
        dependencies = {k: v if v or k == 'base' else {'base'} for k, v in dependencies.items()}

        g = PackageGraph(dependencies)

        # Create Cytoscape elements
        nodes = []
        edges = []
        depth_count = defaultdict(int)
        for package in g:
            depth_count[package.depth] += 1
            nodes.append({
                'data': {'id': package.name, 'label': package.name},
                'position': {'x': depth_count[package.depth] * 150, 'y': package.depth * 100},
            })
            for dep in package.depends:
                edges.append({
                    'data': {'source': package.name, 'target': dep.name}
                })

        stylesheet = [
            {
                'selector': 'node',
                'style': {
                    'content': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'background-color': 'white',
                    'color': '#714B67',
                    'border-color': '#714B67',
                    'border-width': 2,
                    'shape': 'rectangle',
                    'width': '120px',
                    'height': '40px',
                }
            },
            {
                'selector': 'edge',
                'style': {
                    'curve-style': 'bezier',
                    'target-arrow-shape': 'triangle',
                    'width': 1,
                }
            },
        ]

        data = {
            'name': 'Module Dependencies',
            'nodes': nodes,
            'edges': edges,
            'stylesheet': stylesheet,
        }
        if module_graph := self.env.ref('graphview.modules', raise_if_not_found=False):
            module_graph.write(data)
        else:
            module_graph = self.create(data)
            self.env['ir.model.data'].create({
                'name': 'modules',
                'model': 'graphview.graph',
                'res_id': module_graph.id,
                'module': 'graphview',
                'noupdate': True
            })

        return {
          "type": "ir.actions.act_window",
          "view_mode": "list,form",
          "res_model": self._name,
        }
