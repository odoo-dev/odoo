# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class FleetServiceType(models.Model):
    _name = 'fleet.service.type'
    _description = 'Fleet Service Type'
    _order = 'name'

    _fleet__type_service_service_7 = models.Ref('fleet.type_service_service_7', required=False)

    name = fields.Char(required=True, translate=True)
    category = fields.Selection([
        ('contract', 'Contract'),
        ('service', 'Service')
        ], 'Category', required=True, help='Choose whether the service refer to contracts, vehicle services or both')
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    active = fields.Boolean(default=True)
