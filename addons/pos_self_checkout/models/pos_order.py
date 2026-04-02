# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging

from odoo import models, fields

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    source = fields.Selection(selection_add=[
        ('checkout', 'Checkout'),
    ])

    def _get_self_prefix(self, pos_config, device_type):
        if device_type in ['checkout']:
            return f"C{pos_config.id}-"
        return super()._get_self_prefix(pos_config, device_type)
