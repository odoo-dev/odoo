# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.addons.http_routing.models.ir_http import slug


class ResPartnerGrade(models.Model):
    _name = 'res.partner.grade'
    _order = 'sequence'
    _inherit = ['website.published.mixin']
    _description = 'Partner Grade'

    sequence = fields.Integer('Sequence')
    active = fields.Boolean('Active', default=lambda *args: 1)
    name = fields.Char('Level Name', translate=True)
    partner_weight = fields.Integer('Level Weight', default=1,
        help="Gives the probability to assign a lead to this partner. (0 means no assignment.)")

    def _compute_website_url(self):
        super(ResPartnerGrade, self)._compute_website_url()
        for grade in self:
            grade.website_url = "/partners/grade/%s" % (slug(grade))

    def _default_is_published(self):
        return True


class ResPartnerActivation(models.Model):
    _name = 'res.partner.activation'
    _order = 'sequence'
    _description = 'Partner Activation'

    sequence = fields.Integer('Sequence')
    name = fields.Char('Name', required=True)


class ResPartner(models.Model):
    _inherit = "res.partner"

    partner_weight = fields.Integer(
        'Level Weight', compute='_compute_partner_weight',
        readonly=False, store=True, tracking=True,
        help="This should be a numerical value greater than 0 which will decide the contention for this partner to take this lead/opportunity.")
    grade_id = fields.Many2one('res.partner.grade', 'Partner Level', tracking=True)
    grade_sequence = fields.Integer(related='grade_id.sequence', readonly=True, store=True)
    activation = fields.Many2one('res.partner.activation', 'Activation', index=True, tracking=True)
    date_partnership = fields.Date('Partnership Date')
    date_review = fields.Date('Latest Partner Review')
    date_review_next = fields.Date('Next Partner Review')
    # customer implementation
    assigned_partner_id = fields.Many2one(
        'res.partner', 'Implemented by',
    )
    implemented_partner_ids = fields.One2many(
        'res.partner', 'assigned_partner_id',
        string='Implementation References',
    )
    implemented_count = fields.Integer(compute='_compute_implemented_partner_count', store=True)

    @api.depends('implemented_partner_ids', 'implemented_partner_ids.website_published', 'implemented_partner_ids.active')
    def _compute_implemented_partner_count(self):
        for partner in self:
            partner.implemented_count = len(partner.implemented_partner_ids.filtered('website_published'))

    @api.depends('grade_id.partner_weight')
    def _compute_partner_weight(self):
        for partner in self:
            partner.partner_weight = partner.grade_id.partner_weight if partner.grade_id else 0

    @api.model_create_multi
    def create(self, vals_list):
        res = super(ResPartner, self).create(vals_list)
        lowest_grade = self.env['res.partner.grade'].search([], order='partner_weight asc', limit=1)
        lowest_activation = self.env['res.partner.activation'].search([], limit=1)
        if self._context.get('assign_lowest_grade'):
            if lowest_grade:
                res['grade_id'] = lowest_grade.id
            if lowest_activation:
                res['activation'] = lowest_activation.id
        return res

    def _compute_opportunity_count(self):
        res = super(ResPartner, self)._compute_opportunity_count()
        all_partners = self.with_context(active_test=False).search([('id', 'child_of', self.ids)])
        all_partners.read(['parent_id'])

        opportunity_data = self.env['crm.lead'].read_group(
            domain=['|', ('partner_id', 'in', all_partners.ids), ('partner_assigned_id', 'in', all_partners.ids)],
            fields=['partner_id', 'partner_assigned_id'], groupby=['partner_id', 'partner_assigned_id'], lazy=False
        )

        self.opportunity_count = 0
        for group in opportunity_data:
            if self.browse(group['partner_id']):
                partner = self.browse(group['partner_id'][0])
                while partner:
                    if partner in self:
                        partner.opportunity_count += group['__count']
                    partner = partner.parent_id
            if self.browse(group['partner_assigned_id']):
                partner = self.browse(group['partner_assigned_id'][0])
                while partner:
                    if partner in self:
                        partner.opportunity_count += group['__count']
                    partner = partner.parent_id
        return res

    def action_view_opportunity(self):
        res = super(ResPartner, self).action_view_opportunity()
        action = self.env['ir.actions.act_window']._for_xml_id('crm.crm_lead_opportunities')
        if self.is_company:
            action['domain'] = ['|', ('partner_id.commercial_partner_id.id', '=', self.id), ('partner_assigned_id.commercial_partner_id.id', '=', self.id)]
            domain = action['domain']
        else:
            action['domain'] = ['|', ('partner_id.id', '=', self.id), ('partner_assigned_id', '=', self.id)]
            domain = action['domain']
        return dict(res, domain=domain)
