from odoo import models, fields, api


class InheritedModel(models.Model):
    _name = "inherited.model"
    _description = "Inherited Model"
    _inherits = {"base.model": "base_model_id"}

    base_model_id = fields.Many2one("base.model",required=True, ondelete='restrict')
    child_model_field = fields.Char(string="Test Field for Relation")
