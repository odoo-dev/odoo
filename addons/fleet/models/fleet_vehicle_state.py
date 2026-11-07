# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class FleetVehicleState(models.Model):
    _name = 'fleet.vehicle.state'
    _order = 'sequence asc'
    _description = 'Vehicle Status'

    _fleet__fleet_vehicle_state_new_request = models.Ref('fleet.fleet_vehicle_state_new_request', required=False)
    _fleet__fleet_vehicle_state_waiting_list = models.Ref('fleet.fleet_vehicle_state_waiting_list', required=False)

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer()
    fold = fields.Boolean(string='Folded in Kanban')

    _fleet_state_name_unique = models.Constraint(
        'unique(name)',
        'State name already exists',
    )
