from odoo import fields, models, api


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    emission_factor_id = fields.Many2one('esg.emission.factor', string='Emission', compute='_compute_emission_factor_id', store=True)
    uncertainty = fields.Float(related='emission_factor_id.uncertainty', readonly=True)
    total_value = fields.Float(compute='_compute_total_value')

    @api.depends('quantity', 'emission_factor_id.emissions_value')
    def _compute_total_value(self):
        for line in self:
            line.total_value = line.quantity * line.emission_factor_id.emissions_value

    @api.depends('product_id', 'account_id', 'move_id.partner_id')
    def _compute_emission_factor_id(self):
        assignation_lines_per_product = dict(self.env['esg.emission.factor.line.assignation']._read_group(
            domain=[('product_id', 'in', [False] + self.product_id.ids)],
            groupby=['product_id'],
            aggregates=['id:recordset'],
            order='product_id desc',
        ))

        for line in self:
            assignation_lines = assignation_lines_per_product.get(line.product_id)
            if not assignation_lines:
                continue # TODO: use bayes based on vendor and description (like account)

            same_vendor_assignation_lines = assignation_lines.filtered(lambda l: l.vendor_id == line.move_id.partner_id)
            if same_vendor_assignation_lines:
                same_account_assignation_lines = same_vendor_assignation_lines.filtered(lambda l: l.account_id == line.account_id)
                if same_account_assignation_lines:
                    line.emission_factor_id = same_account_assignation_lines[0].emission_factor_id
                else:
                    line.emission_factor_id = same_vendor_assignation_lines.emission_factor_id.sorted('sequence')[0]
            else:
                line.emission_factor_id = assignation_lines.emission_factor_id.sorted('sequence')[0]


