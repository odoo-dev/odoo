from random import randint

from odoo import fields, models


class EsgActivityType(models.Model):
    _name = 'esg.activity.type'
    _description = 'Activity Type'

    def _get_default_color(self):
        return randint(1, 11)

    name = fields.Char(required=True, translate=True)
    color = fields.Integer(default=_get_default_color)

    _name_uniq = models.Constraint(
        'unique (name)',
        'A tag with the same name already exists.',
    )
