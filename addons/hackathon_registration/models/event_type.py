from odoo import fields, models


class EventType(models.Model):
    _inherit = 'event.type'

    event_registration_stage_ids = fields.Many2many(
        'event.registration.stage', string="Registration Stage")
