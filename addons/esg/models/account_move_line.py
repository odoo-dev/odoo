from collections import defaultdict

from odoo import fields, models, api


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    emission_factor_id = fields.Many2one('esg.emission.factor', string='Emission', compute='_compute_emission_factor_id', store=True, readonly=False)
    uncertainty = fields.Float(string='CO2 uncertainty', related='emission_factor_id.uncertainty', readonly=True)
    total_value = fields.Float(string='CO2', compute='_compute_total_value', store=True)

    @api.depends('quantity', 'emission_factor_id') # do not depend on emission_factor_id.emissions_value because we only do the recomputation when using the wizard 'factors_retroaction_wizard' for a given date
    def _compute_total_value(self):
        for line in self:
            line.total_value = line.quantity * line.emission_factor_id.emissions_value

    @api.depends('product_id', 'account_id', 'move_id.partner_id')
    def _compute_emission_factor_id(self):
        Assignation = self.env['esg.emission.factor.line.assignation']
        assignation_lines = Assignation.search([
            '|',
            '|',
            ('product_id', 'in', self.product_id.ids),
            ('vendor_id', 'in', self.move_id.partner_id.ids),
            ('account_id', 'in', self.account_id.ids)
        ])

        assignation_lines_per_product, assignation_lines_per_vendor, assignation_lines_per_account = defaultdict(Assignation.browse), defaultdict(Assignation.browse), defaultdict(Assignation.browse)
        for line in assignation_lines:
            if line.product_id:
                assignation_lines_per_product[line.product_id] |= line
            if line.vendor_id:
                assignation_lines_per_vendor[line.vendor_id] |= line
            if line.account_id:
                assignation_lines_per_account[line.account_id] |= line

        for line in self:
            same_product_assignation_lines = assignation_lines_per_product.get(line.product_id)
            if same_product_assignation_lines:
                same_vendor_assignation_lines = same_product_assignation_lines.filtered(lambda l: l.vendor_id == line.move_id.partner_id)
                if same_vendor_assignation_lines:
                    same_account_assignation_lines = same_vendor_assignation_lines.filtered(lambda l: l.account_id == line.account_id)
                    if same_account_assignation_lines:
                        line.emission_factor_id = same_account_assignation_lines[0].emission_factor_id
                    else:
                        line.emission_factor_id = same_vendor_assignation_lines.emission_factor_id.sorted('sequence')[0]
                else:
                    same_account_assignation_lines = same_product_assignation_lines.filtered(lambda l: l.account_id == line.account_id)
                    if same_account_assignation_lines:
                        line.emission_factor_id = same_account_assignation_lines[0].emission_factor_id
                    else:
                        line.emission_factor_id = same_product_assignation_lines.emission_factor_id.sorted('sequence')[0]
            else:
                same_vendor_assignation_lines = assignation_lines_per_vendor.get(line.product_id)
                if same_vendor_assignation_lines:
                    same_account_assignation_lines = same_vendor_assignation_lines.filtered(lambda l: l.account_id == line.account_id)
                    if same_account_assignation_lines:
                        line.emission_factor_id = same_account_assignation_lines[0].emission_factor_id
                    else:
                        line.emission_factor_id = same_vendor_assignation_lines.emission_factor_id.sorted('sequence')[0]
                else:
                    line.emission_factor_id = assignation_lines_per_account.get(line.account_id, Assignation).emission_factor_id.sorted('sequence')[:1]
