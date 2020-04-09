# -*- coding: utf-8 -*-
import logging

from odoo import models, fields
from odoo.tools import populate
_logger = logging.getLogger(__name__)

class AccountJournal(models.Model):
    _inherit = "account.journal"
    _populate_sizes = {
        'small': 10,
        'medium': 30,
        'large': 100,
    }

    _populate_dependencies = ['res.company']

    def _populate_factories(self):
        company_ids = self.env['res.company'].search([('chart_template_id', '!=', False), ('id', 'in', self.env.registry.populated_models['res.company'])])
        return [
            ('company_id', populate.cartesian(company_ids.ids)),
            ('type', populate.cartesian(['sale', 'purchase', 'cash', 'bank', 'general'])),
            ('currency_id', populate.randomize(self.env['res.currency'].search([('active', '=', True)]).ids + [False])),
            ('name', populate.constant("Journal {values[type]} {counter}")),
            ('code', populate.constant("{values[type]:.4}{counter}")),
        ]
