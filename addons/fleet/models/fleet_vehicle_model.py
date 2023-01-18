# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models


FUEL_TYPES = [
    ('diesel', 'Diesel'),
    ('gasoline', 'Gasoline'),
    ('full_hybrid', 'Full Hybrid'),
    ('plug_in_hybrid_diesel', 'Plug-in Hybrid Diesel'),
    ('plug_in_hybrid_gasoline', 'Plug-in Hybrid Gasoline'),
    ('cng', 'CNG'),
    ('lpg', 'LPG'),
    ('hydrogen', 'Hydrogen'),
    ('electric', 'Electric'),
]

class FleetVehicleModel(models.Model):
    _name = 'fleet.vehicle.model'
    _description = 'Model of a vehicle'
    _order = 'name asc'

    name = fields.Char('Model name', required=True)
    brand_id = fields.Many2one('fleet.vehicle.model.brand', 'Manufacturer', required=True)
    category_id = fields.Many2one('fleet.vehicle.model.category', 'Category')
    vendors = fields.Many2many('res.partner', 'fleet_vehicle_model_vendors', 'model_id', 'partner_id', string='Vendors')
    image_128 = fields.Image(related='brand_id.image_128', readonly=True)
    active = fields.Boolean(default=True)
    vehicle_type = fields.Selection([('car', 'Car'), ('bike', 'Bike')], default='car', required=True)
    transmission = fields.Selection([('manual', 'Manual'), ('automatic', 'Automatic')], 'Transmission')
    vehicle_count = fields.Integer(compute='_compute_vehicle_count')
    model_year = fields.Integer()
    color = fields.Char()
    seats = fields.Integer(string='Seats Number')
    doors = fields.Integer(string='Doors Number')
    trailer_hook = fields.Boolean(default=False, string='Trailer Hitch')
    default_co2 = fields.Float('CO2 Emissions')
    co2_standard = fields.Char()
    default_fuel_type = fields.Selection(FUEL_TYPES, 'Fuel Type', default='diesel')
    power = fields.Integer('Power')
    horsepower = fields.Integer()
    horsepower_tax = fields.Float('Horsepower Taxation')
    electric_assistance = fields.Boolean(default=False)

    def name_get(self):
        res = []
        for record in self:
            name = record.name
            if record.brand_id.name:
                name = record.brand_id.name + '/' + name
            res.append((record.id, name))
        return res

    def _compute_vehicle_count(self):
        groups = self.env['fleet.vehicle']._aggregate(
            [('model_id', 'in', self.ids)], ['*:count'], ['model_id']
        )
        for model in self:
            model.vehicle_count = groups.get_agg(model.id, '*:count', 0)

    def action_model_vehicle(self):
        self.ensure_one()
        view = {
            'type': 'ir.actions.act_window',
            'view_mode': 'kanban,tree,form',
            'res_model': 'fleet.vehicle',
            'name': _('Vehicles'),
            'context': {'search_default_model_id': self.id, 'default_model_id': self.id}
        }

        return view
