# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class WebsiteSurveyFeature(models.Model):

    _name = 'website.survey.feature'
    _description = 'Website Survey Feature'
    _order = 'sequence'

    title = fields.Char(translate=True)
    description = fields.Char(translate=True)
    icon = fields.Char()
    iap_page_code = fields.Char(help='Page code used to tell IAP website_service for which page a snippet list should be generated')
    website_types_preselection = fields.Char(help='Commas separated list of website type for which this feature should be pre-selected')
    type = fields.Selection([('page', "Page"), ('app', "App")], compute='_compute_type')
    module_id = fields.Many2one('ir.module.module', ondelete='cascade')
    page_view_id = fields.Many2one('ir.ui.view', ondelete='cascade')
    sequence = fields.Integer()

    @api.constrains('module_id', 'page_view_id')
    def _check_module_xor_page_view(self):
        return bool(self.module_id) != bool(self.page_view_id)

    @api.depends('module_id', 'page_view_id')
    def _compute_type(self):
        for record in self:
            record.type = 'page' if record.page_view_id else 'app'
