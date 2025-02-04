from odoo import fields, models, api, _


class EmittedEmissions(models.TransientModel):
    _name = 'esg.emitted.emissions'
    _description = 'Emitted Emissions'

    res_id = fields.Integer(required=True)
    date = fields.Date(required=True)
    emission_factor_id = fields.Many2one('esg.emission.factor', required=True)
    move_id = fields.Many2one('account.move', string='Bill')
    note = fields.Text()
    quantity = fields.Integer(required=True, default=1)
    value = fields.Float(string='CO2', compute='_compute_value')
    uncertainty = fields.Float(related='emission_factor_id.uncertainty')
    type = fields.Selection(
        selection=[('other_emission', 'Other Emission'), ('account_emission', 'Account Emission')],
        default='other_emission',
    )

    @api.depends('quantity', 'emission_factor_id')
    def _compute_value(self):
        for emission in self:
            emission.value = emission.quantity * emission.emission_factor_id.emissions_value

    def _action_emmitted_emissions(self):
        wizard = self.env['esg.emitted.emissions'].with_context(from_action=True).create([{
            'res_id': line.id,
            'date': line.date,
            'emission_factor_id': line.emission_factor_id.id,
            'move_id': line.move_id.id,
            'note': line.product_id.description,
            'quantity': line.quantity,
            'value': line.total_value,
            'uncertainty': line.uncertainty,
            'type': 'account_emission',
        } for line in self.env['account.move.line'].search([('emission_factor_id', '!=', False)])] + [{
            'res_id': other_emission.id,
            'date': other_emission.date,
            'emission_factor_id': other_emission.emission_factor_id.id,
            'move_id': False,
            'note': other_emission.note,
            'quantity': other_emission.quantity,
            'value': other_emission.value,
            'uncertainty': other_emission.uncertainty,
            'type': 'other_emission',
        } for other_emission in self.env['esg.other.emission'].search([])])

        return {
            'name': 'All Emitted Emissions',
            'type': 'ir.actions.act_window',
            'res_model': 'esg.emitted.emissions',
            'view_mode': 'list',
            'domain': [('id', 'in', wizard.ids)],
        }

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.context.get('from_action'):
            other_emissions = self.env['esg.other.emission'].create([
                {
                    'date': vals['date'],
                    'emission_factor_id': vals['emission_factor_id'],
                    'note': vals['note'],
                    'quantity': vals['quantity'],
                } for vals in vals_list
            ])

            for vals, other_emission in zip(vals_list, other_emissions):
                vals['res_id'] = other_emission.id
                vals['type'] = 'other_emission'
        return super().create(vals_list)

    def write(self, vals):
        account_move_line_vals = {
            field: value
            for field, value in vals.items()
            if field in ['emission_factor_id', 'note', 'quantity']
        }

        other_emission_vals = dict(account_move_line_vals)

        if 'date' in vals:
            other_emission_vals['date'] = vals['date']

        other_emission_ids = self.filtered(lambda emission: emission.type == 'other_emission').mapped('res_id')
        self.env['esg.other.emission'].browse(other_emission_ids).write(other_emission_vals)

        account_move_line_ids = self.filtered(lambda emission: emission.type == 'account_emission').mapped('res_id')
        self.env['account.move.line'].browse(account_move_line_ids).write(account_move_line_vals)
        return super().write(vals)
