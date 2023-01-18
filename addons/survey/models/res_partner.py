# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    certifications_count = fields.Integer('Certifications Count', compute='_compute_certifications_count')
    certifications_company_count = fields.Integer('Company Certifications Count', compute='_compute_certifications_company_count')

    @api.depends('is_company')
    def _compute_certifications_count(self):
        aggregate_res = self.env['survey.user_input'].sudo()._aggregate(
            [('partner_id', 'in', self.ids), ('scoring_success', '=', True)],
            ['*:count'], ['partner_id']
        )
        for partner in self:
            partner.certifications_count = aggregate_res.get_agg(partner, '*:count', 0)

    @api.depends('is_company', 'child_ids.certifications_count')
    def _compute_certifications_company_count(self):
        self.certifications_company_count = sum(child.certifications_count for child in self.child_ids)

    def action_view_certifications(self):
        action = self.env["ir.actions.actions"]._for_xml_id("survey.res_partner_action_certifications")
        action['view_mode'] = 'tree'
        action['domain'] = ['|', ('partner_id', 'in', self.ids), ('partner_id', 'in', self.child_ids.ids)]

        return action
