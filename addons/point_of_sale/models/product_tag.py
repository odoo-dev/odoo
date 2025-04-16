# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.tools import is_html_empty


class ProductTag(models.Model):
    _name = 'product.tag'
    _inherit = ['product.tag', 'pos.load.mixin']

    has_image = fields.Boolean(compute='_compute_has_image')
    description = fields.Html(string='Description', translate=True)

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['name', 'description', 'color', 'has_image']

    @api.depends('has_image')
    def _compute_has_image(self):
        for tag in self:
            tag.has_image = bool(tag.image)

    def write(self, vals):
        if vals.get('description') and is_html_empty(vals['description']):
            vals['description'] = ''
        return super().write(vals)
