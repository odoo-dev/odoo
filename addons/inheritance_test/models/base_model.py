from odoo import models, fields, api


class BAseModel(models.Model):
    _name = "base.model"
    _description = "Base Model"

    name = fields.Char(string="Name")
    description = fields.Char(string="Description", compute="_compute_description")

    inherited_ids = fields.One2many("inherited.model", "base_model_id", string="inherited_ids")

    @api.depends("inherited_ids.child_model_field")
    def _compute_description(self):
        for record in self:
            record.description = f"Description: {record.inherited_ids[0].child_model_field}" if record.inherited_ids and record.inherited_ids[0].child_model_field else "No description available"
