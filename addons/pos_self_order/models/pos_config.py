# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

class PosConfig(models.Model):
    _inherit = 'pos.config'

    def self_order_allow_view_menu(self):
        """
        Returns True if the menu can be viewed by customers on their phones, by scanning the QR code on the table and going to the provided URL.
        :return: True if the menu can be viewed, False otherwise
        :rtype: bool
        """
        self.ensure_one()
        return self.self_order_view_mode 
