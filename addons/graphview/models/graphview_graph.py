from odoo import models, fields, api


class GraphviewTemplate(models.AbstractModel):
    _name = 'graphview.template'
    _description = 'Graph View Template'

    def generate_graph(self):
        return {
            'nodes': [],
            'edges': [],
            'stylesheet': [],
            'layout': {},
        }


class GraphviewGraph(models.Model):
    _name = 'graphview.graph'
    _description = 'Graph View'

    name = fields.Char(string='Name', required=True)
    graph_view_template_name = fields.Char(string='Graph View Template Name')
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

    def generate_graph(self):
        for graph in self:
            template = self.env.get(graph.graph_view_template_name)
            if not isinstance(template, GraphviewTemplate):
                continue
            data = self.env[graph.graph_view_template_name].generate_graph()
            graph.write(data)
