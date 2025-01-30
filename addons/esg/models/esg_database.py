from odoo import fields, models


class EsgDatabase(models.Model):
    _name = 'esg.database'
    _description = 'Database'

    name = fields.Char(required=True)
    url = fields.Char()
    last_update = fields.Datetime(default=lambda self: fields.Datetime.now())
