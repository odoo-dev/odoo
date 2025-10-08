from odoo import fields, models


class EventRegistrationStage(models.Model):
    _name = 'event.registration.stage'

    name = fields.Char(string="Stage Name", required=True)
