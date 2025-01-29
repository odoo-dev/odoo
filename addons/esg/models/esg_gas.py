from odoo import api, fields, models
from odoo.exceptions import ValidationError


class EsgGas(models.Model):
    _name = "esg.gas"

    name = fields.Char()
    sequence = fields.Integer(default=10)
    global_warming_potential = fields.Integer("Global Warming Potential (GWP)")
    category = fields.Selection([
        ("co2", "Carbon Dioxide (CO2)"),
        ("ch4", "Methane (CH4)"),
        ("n2o", "Nitrous Oxide (N2O)"),
        ("hfc", "Hydrofluorocarbons (HFCs)"),
        ("pfc", "Perfluorocarbons (PFCs)"),
        ("sf6", "Sulfur Hexafluoride (SF6)"),
    ], required=True)
    factor = fields.Float()
