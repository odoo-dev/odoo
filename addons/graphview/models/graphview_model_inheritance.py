from odoo import models


class GraphviewModelInheritance(models.Model):
    _name = 'graphview.model.inheritance'
    _inherit = 'graphview.template'
    _description = 'Model Inheritance Graph View'

    def generate_graph(self):
        nodes = set()
        edges = {}
        for model_name, model in self.env.registry.items():
            model_name = model._name
            pre_node = f'{model._module}.{model_name}'
            for model_name_ in model._inherits:
                model_ = self.pool[model_name_]
                cur_node = f'{model_._module}.{model_name_}'
                nodes.add(cur_node)
                edges[(pre_node, cur_node)] = {'color': 'green'}
            
            base_class = models.AbstractModel if model._abstract else models.TransientModel if model._transient else models.Model
            for model_class in model.mro():
                if not model_class._module or not issubclass(model_class, base_class):
                    break
                if  model_name != 'base' and model_class is self.env.registry['base']:
                    break
                cur_node = f'{model_class._module}.{model_class._name}'
                nodes.add(cur_node)
                if pre_node != cur_node:
                    color = 'blue' if pre_node.split('.', 1)[1] == cur_node.split('.', 1)[1] else 'red'
                    edges[(pre_node, cur_node)] = {'color': color}
                pre_node = cur_node
                
        nodes = [
            {
                'data': {
                    'id': node,
                    'label': node,
                },
            }
            for node in nodes
        ]
        edges = [
            {
                'data': {
                    'source': edge[0],
                    'target': edge[1],
                    **attr,
                }
            }
            for edge, attr in edges.items()
        ]
        stylesheet = [
            {
                'selector': 'node',
                'style': {
                    'label': 'data(label)',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'text-valign': 'bottom',
                    'background-color': 'data(color)',  # Use the color from node data
                    'color': 'black',
                    'font-size': '5px',
                    'width': '10px',
                    'height': '10px'
                }
            },
            {
                'selector': 'edge',
                'style': {
                    'target-arrow-shape': 'triangle',
                    'target-arrow-color': 'red',
                    'curve-style': 'bezier',
                    'line-color': 'data(color)',
                    'width': '1px',
                    'arrow-scale': 0.5,
                }
            }
        ]
        layout = {
            'name': 'cose',
            # Optional layout parameters
            'idealEdgeLength': 100,
            'nodeOverlap': 20,
            'refresh': 20,
            'fit': True,  # whether to fit to viewport
            'padding': 30,  # padding around layout
            'randomize': False,  # whether to randomize node positions on first run
            'componentSpacing': 100,
            "nodeRepulsion": 4000,
            "edgeElasticity": 100,
            'nestingFactor': 5,
            'gravity': 80,
            'numIter': 1000,
            'initialTemp': 200,
            'coolingFactor': 0.95,
            'minTemp': 1.0
        }
        data = {
            'name': 'Model Inheritance',
            'layout': layout,
            'nodes': nodes,
            'edges': edges,
            'stylesheet': stylesheet,
        }
        return data
