from collections import defaultdict

from odoo import models, fields, api
from odoo.tools import lazy_property, OrderedSet

from typing import Set, Dict, Tuple, Iterable, Iterator

class Node:
    """
    Base class for a node in a graph
    """
    def __init__(self, name: str) -> None:
        self.name = name
        self.edges: Set[Node] = set()

    def add_edge(self, node: 'Node') -> None:
        self.edges.add(node)


class Graph:
    """
    Base class for a graph
    """
    def __init__(self) -> None:
        self._nodes: Dict[str, Node] = {}

    def add_node(self, name: str) -> Node:
        if name not in self._nodes:
            self._nodes[name] = Node(name)
        return self._nodes[name]

    def add_edge(self, source: str, target: str) -> None:
        source_node = self.add_node(source)
        target_node = self.add_node(target)
        source_node.add_edge(target_node)

    def __getitem__(self, name: str) -> Node:
        return self._nodes[name]

    def __iter__(self) -> Iterator[Node]:
        return iter(self._nodes.values())

    def __len__(self) -> int:
        return len(self._nodes)


class DAGNode(Node):
    """
    Represents a node in a Directed Acyclic Graph (DAG)
    """
    @lazy_property
    def depth(self) -> int:
        """ Return the longest distance from self to a leaf node. """
        return max(node.depth for node in self.edges) + 1 if self.edges else 0


class DirectedAcyclicGraph(Graph):
    """
    Directed Acyclic Graph (DAG) implementation
    """

    def __init__(self, dependencies: Dict[str, Set[str]]) -> None:
        super().__init__()

        for name, deps in dependencies.items():
            for dep in deps:
                self.add_edge(name, dep)
        self.validate()

    def add_node(self, name: str) -> DAGNode:
        if name not in self._nodes:
            self._nodes[name] = DAGNode(name)
        return self._nodes[name]

    def validate(self):
        """
        Detect cycles in the graph using iterative depth-first search with StopIteration
        """
        visited = set()
        
        for start_node in self._nodes.values():
            if start_node in visited:
                continue

            path = {start_node: iter(start_node.edges)}
            while path:
                node, edge_iter = next(reversed(path.items()))
                if next_node := next(edge_iter, None):
                    if next_node.name in path:
                        raise ValueError(f"Cycle detected: {' -> '.join(n.name for n in path)} -> {next_node.name}")
                    if next_node not in visited:
                        path[next_node] = iter(next_node.edges)
                else:
                    visited.add(node)
                    del path[node]


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

        dag = DirectedAcyclicGraph(dependencies)

        # Create Cytoscape elements
        nodes = []
        edges = []
        depth_count = defaultdict(int)
        for node in sorted(list(dag), key=lambda n: (n.depth, n.name)):
            depth_count[node.depth] += 1
            nodes.append({
                'data': {'id': node.name, 'label': node.name},
                'position': {'x': depth_count[node.depth] * 150, 'y': node.depth * 100},
            })
            for edge in node.edges:
                edges.append({
                    'data': {'source': node.name, 'target': edge.name}
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
