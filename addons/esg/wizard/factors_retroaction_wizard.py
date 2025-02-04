# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _
from odoo.osv import expression


class FactorsRetroactionWizard(models.TransientModel):
    _name = 'factors.retroaction.wizard'
    _description = "Apply retroactiverly new factors to old bills and other emissions"

    start_date = fields.Date(required=True)
    end_date = fields.Date()

    def create(self, vals):
        wizard = super().create(vals)
        emission_factors = self.env['esg.emission.factor'].browse(self.env.context.get('active_ids'))
        domain = [
            ('emission_factor_id', 'in', emission_factors.ids),
            ('date', '>=', wizard.start_date),
        ]
        if wizard.end_date:
            domain = expression.AND([domain, [('date', '<=', wizard.end_date)]])

        for emission_factor, quantity, lines in self.env['account.move.line']._read_group(
            domain=domain,
            groupby=['emission_factor_id', 'quantity'],
            aggregates=['id:recordset'],
        ):
            lines.total_value = emission_factor.emissions_value * quantity
        return wizard
