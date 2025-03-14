from odoo import _, api, fields, models
from odoo.exceptions import AccessError, ValidationError


class PropertiesBaseDefinition(models.Model):
    """Models storing the properties definition of the record without parent."""

    _name = "properties.base.definition"
    _description = "Properties Base Definition"
    _log_access = False

    properties_field_id = fields.Many2one("ir.model.fields")
    properties_definition = fields.PropertiesDefinition("Properties Definition")

    @api.constrains('properties_field_id')
    def _check_properties_field_id(self):
        if set(self.mapped('properties_field_id.ttype')) - {'properties'}:
            raise ValidationError(_("The definition needs to be linked to a properties field."))

    @api.model
    def has_access_properties_definition(self, model_name):
        """Return True if the current user can edit the base definition."""
        if not self.env[model_name].has_access('write'):
            return False

        # TODO: who can edit the base definition?
        return True

    def _get_or_create_record(self, model_name, field_name):
        definition_record = self.sudo().search(
            [
                ("properties_field_id.model", "=", model_name),
                ("properties_field_id.name", "=", field_name),
            ],
            limit=1,
        )
        if not definition_record:
            definition_record = self.sudo().create(
                {
                    "properties_field_id": self.env["ir.model.fields"]
                    .sudo()
                    ._get(model_name, field_name)
                    .id,
                },
            )
        return definition_record
