# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, tools


class CustomizationRule(models.Model):

    _name = "website.customization.rule"
    _description = "Customization Rule"

    _sql_constraints = [
        (
            'unique_snippet_theme_page_locatio_quadruplet', 'UNIQUE(snippet, theme, location, page)',
            'XPath associated to (snippet, theme, location, page) quadruplet should be unique)')
    ]

    snippet = fields.Selection([
        ('s_banner', 's_banner'),
        ('s_call_to_action', 's_call_to_action'),
        ('s_carousel', 's_carousel'),
        ('s_company_team', 's_company_team'),
        ('s_comparisons', 's_comparisons'),
        ('s_cover', 's_cover'),
        ('s_faq_collapse', 's_faq_collapse'),
        ('s_features', 's_features'),
        ('s_features_grid', 's_features_grid'),
        ('s_image_gallery', 's_image_gallery'),
        ('s_images_wall', 's_images_wall'),
        ('s_image_text', 's_image_text'),
        ('s_masonry_block', 's_masonry_block'),
        ('s_media_list', 's_media_list'),
        ('s_numbers', 's_numbers'),
        ('s_parallax', 's_parallax'),
        ('s_picture', 's_picture'),
        ('s_product_catalog', 's_product_catalog'),
        ('s_product_list', 's_product_list'),
        ('s_quotes_carousel', 's_quotes_carousel'),
        ('s_references', 's_references'),
        ('s_showcase', 's_showcase'),
        ('s_table_of_content', 's_table_of_content'),
        ('s_tabs', 's_tabs'),
        ('s_text_block', 's_text_block'),
        ('s_text_image', 's_text_image'),
        ('s_three_columns', 's_three_columns'),
        ('s_timeline', 's_timeline'),
        ('s_title', 's_title'),
    ], index=True, required=True)
    theme = fields.Selection([
        ('all', 'all'),
        ('theme_anelusia', 'theme_anelusia'),
        ('theme_artists', 'theme_artists'),
        ('theme_avantgarde', 'theme_avantgarde'),
        ('theme_beauty', 'theme_beauty'),
        ('theme_bewise', 'theme_bewise'),
        ('theme_bistro', 'theme_bistro'),
        ('theme_bookstore', 'theme_bookstore'),
        ('theme_clean', 'theme_clean'),
        ('theme_cobalt', 'theme_cobalt'),
        ('theme_enark', 'theme_enark'),
        ('theme_graphene', 'theme_graphene'),
        ('theme_kea', 'theme_kea'),
        ('theme_kiddo', 'theme_kiddo'),
        ('theme_loftspace', 'theme_loftspace'),
        ('theme_monglia', 'theme_monglia'),
        ('theme_nano', 'theme_nano'),
        ('theme_notes', 'theme_notes'),
        ('theme_odoo_experts', 'theme_odoo_experts'),
        ('theme_orchid', 'theme_orchid'),
        ('theme_paptic', 'theme_paptic'),
        ('theme_real_estate', 'theme_real_estate'),
        ('theme_treehouse', 'theme_treehouse'),
        ('theme_vehicle', 'theme_vehicle'),
        ('theme_yes', 'theme_yes'),
        ('theme_zap', 'theme_zap'),
    ], required=True)
    page = fields.Selection([
        ('all', 'all'),
        ('homepage', 'homepage'),
        ('about_us', 'about_us'),
        ('our_services', 'our_services'),
        ('pricing', 'pricing'),
        ('privacy_policy', 'privacy_policy'),
    ], required=True)
    xpath = fields.Char()
    location = fields.Integer()

    @api.model
    def get_customized_snippet(self, snippet, theme, page_code, industry_id):
        rule_ids = self.env['website.customization.rule'].get_rules(snippet, theme, page_code)
        customizations = filter(lambda rule: rule, [rule_id.get_resource(industry_id) for rule_id in rule_ids])
        return {
            'snippet_key': 'website.' + snippet,
            'customizations': list(customizations)
        }

    @api.model
    def get_rules(self, snippet, theme, page):
        rule_ids = self.env['website.customization.rule'].search([('snippet', '=', snippet), ('theme', '=', theme), ('page', '=', page)])
        locations = rule_ids.mapped('location')
        rule_ids |= self.env['website.customization.rule'].search([('snippet', '=', snippet), ('theme', '=', theme), ('page', '=', 'all'), ('location', 'not in', locations)])
        locations.extend(rule_ids.mapped('location'))
        rule_ids |= self.env['website.customization.rule'].search([('snippet', '=', snippet), ('theme', '=', 'all'), ('page', '=', page), ('location', 'not in', locations)])
        locations.extend(rule_ids.mapped('location'))
        rule_ids |= self.env['website.customization.rule'].search([('snippet', '=', snippet), ('theme', '=', 'all'), ('page', '=', 'all'), ('location', 'not in', locations)])
        return rule_ids

    def get_resource(self, industry_id):
        resource_id = self.env["website.customization.resource"].search([('snippet', '=', self.snippet), ('industry_id', '=', industry_id), ('location', '=', self.location)], limit=1)
        if not resource_id:
            resource_id = self.env["website.customization.resource"].search([('snippet', '=', self.snippet), ('industry_id', '=', False), ('location', '=', self.location)], limit=1)
        if resource_id:
            return {
                'xpath': self.xpath,
                'resource': resource_id.get_resource(),
                'type': resource_id.resource_type
            }
        return False


class CustomizationResource(models.Model):

    _name = "website.customization.resource"
    _description = "Customization Resource"

    _sql_constraints = [
        (
            'unique_snippet_industry_location_triplet', 'UNIQUE(snippet, industry_id, location)',
            'Resource associated to (snippet, industry_id, location) triplet should be unique)')
    ]

    snippet = fields.Selection([
        ('s_banner', 's_banner'),
        ('s_call_to_action', 's_call_to_action'),
        ('s_carousel', 's_carousel'),
        ('s_company_team', 's_company_team'),
        ('s_comparisons', 's_comparisons'),
        ('s_cover', 's_cover'),
        ('s_faq_collapse', 's_faq_collapse'),
        ('s_features', 's_features'),
        ('s_features_grid', 's_features_grid'),
        ('s_image_gallery', 's_image_gallery'),
        ('s_images_wall', 's_images_wall'),
        ('s_image_text', 's_image_text'),
        ('s_masonry_block', 's_masonry_block'),
        ('s_media_list', 's_media_list'),
        ('s_numbers', 's_numbers'),
        ('s_parallax', 's_parallax'),
        ('s_picture', 's_picture'),
        ('s_product_catalog', 's_product_catalog'),
        ('s_product_list', 's_product_list'),
        ('s_quotes_carousel', 's_quotes_carousel'),
        ('s_references', 's_references'),
        ('s_showcase', 's_showcase'),
        ('s_table_of_content', 's_table_of_content'),
        ('s_tabs', 's_tabs'),
        ('s_text_block', 's_text_block'),
        ('s_text_image', 's_text_image'),
        ('s_three_columns', 's_three_columns'),
        ('s_timeline', 's_timeline'),
        ('s_title', 's_title'),
    ], index=True, required=True)

    industry_id = fields.Many2one('website.industry')
    location = fields.Integer('Snippet Resource Location', required=True)

    resource_type = fields.Selection([
        ('text', 'text'),
        ('img', 'img')
    ], required=True)
    resource_text = fields.Text('Resource Text')
    resource_image_id = fields.Image('Resource Image')

    def get_resource(self):
        if self.resource_type == 'text':
            return self.resource_text
        else:
            attachment_id = self.env['ir.attachment'].sudo().search([('res_model', '=', 'website.customization.resource'), ('res_field', '!=', False), ('res_id', '=', self.id)], limit=1)
            name = "{}__{}__{}".format(self.snippet, self.industry_id.name, self.location)
            return {
                'name': name,
                'datas': attachment_id.datas.decode('utf-8'),
            }
