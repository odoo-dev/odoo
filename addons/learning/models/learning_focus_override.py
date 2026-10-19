from odoo import fields, models


class LearningFocusOverride(models.Model):
    """Corrects the automatic importance guess for one field, shipped as data
    by the modules that add lessons."""

    _name = 'learning.focus.override'
    _description = "Focus Mode Override"

    model = fields.Char(string="Model", required=True, index=True)
    field_name = fields.Char(string="Field", required=True)
    focus = fields.Selection(
        string="Focus",
        selection=[('in', "Always important"), ('out', "Never important")],
        required=True,
    )

    _unique_model_field = models.Constraint(
        "UNIQUE(model, field_name)",
        "A field can only have one focus override.",
    )
