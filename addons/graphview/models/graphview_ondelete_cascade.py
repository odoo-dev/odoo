from odoo import models


class GraphviewOndeleteCascade(models.Model):
    _name = 'graphview.ondelete.cascade'
    _inherit = 'graphview.template'
    _description = 'Ondelete Cascade Graph View'

    def generate_graph(self):
        nodes = set()
        edges = []
        red_nodes = set()
        for model_name, model in self.env.items():
            for field_name, field in model._fields.items():
                if field.type == 'many2one' and field.ondelete == 'cascade':
                    if self.env.registry[model_name].unlink is not models.Model.unlink:
                        red_nodes.add(model_name)
                    nodes.add(model_name)
                    nodes.add(field.comodel_name)
                    edges.append({
                        'data': {'source': field.comodel_name, 'target': model_name, 'label': field_name}
                    })
        nodes = [
            {
                'data': {
                    'id': node,
                    'label': node,
                    'color': 'red' if node in red_nodes else 'green'
                },
            }
            for node in nodes
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
                    'line-color': 'black',
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
            'name': 'Ondelete Cascade',
            'layout': layout,
            'nodes': nodes,
            'edges': edges,
            'stylesheet': stylesheet,
        }
        return data
