import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class IrModel(models.Model):
    _inherit = 'ir.model'

    aggregate_state = fields.Selection([
        ('disabled', 'Disabled'),
        ('building', 'Building'),
        ('enabled', 'Enabled'),
    ])
