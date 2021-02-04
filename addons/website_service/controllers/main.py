# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import random

from odoo import http
from odoo.http import request


ILLUSTRATION_THEMES = ['theme_paptic', 'theme_cobalt']

SNIPPET_LISTS = {
    'homepage': {
        "theme_bewise": ["s_cover", "s_call_to_action", "s_text_image", "s_numbers", "s_image_text", "s_quotes_carousel", "s_company_team"],
        "theme_bistro": ['s_cover', 's_features', 's_picture', 's_product_catalog', 's_text_block', 's_quotes_carousel'],
        "default": ['s_cover', 's_text_image', 's_numbers'],
    },
    'about_us': {
        "default": ['s_text_image', 's_image_text', 's_title', 's_company_team'],
    },
    'our_services': {
        "default": ['s_three_columns', 's_quotes_carousel', 's_references'],
    },
    'pricing': {
        "theme_bistro": ['s_text_image', 's_product_catalog'],
        "default": ['s_comparisons'],
    },
    'privacy_policy': {
        "default": ['s_faq_collapse'],
    },
}


class WebsiteService(http.Controller):

    @http.route('/website/recommended_themes', type='json', auth='public', csrf=False)
    def website_recommended_themes(self, description=None, **kw):
        """
        """
        industry_code = description.get('industry_code', False)
        industry_id = request.env['website.industry'].sudo().search([('name', '=', industry_code)], limit=1)
        themes = ['theme_avantgarde', 'theme_cobalt', 'theme_bistro']
        if industry_id:
            link_ids = request.env['website.industry.theme.link'].sudo().search([('industry_id', '=', industry_id.id)])
            themes[:len(link_ids)] = [link_id.theme_id.name for link_id in link_ids]
        if not any([itheme in themes for itheme in ILLUSTRATION_THEMES]):
            themes[2] = random.choice(ILLUSTRATION_THEMES)
        return {
            'themes': themes
        }

    def get_snippet_list(self, page_code, theme):
        page_lists = SNIPPET_LISTS.get(page_code)
        if page_lists:
            return page_lists.get(theme, page_lists.get('default'))
        return []

    @http.route('/website/custom_resources', type='json', auth='public', csrf=False)
    def website_custom_resources(self, data=None, **kw):
        """
        :return resources:
            {
                pages: {
                    page_code_1: [
                        {
                            snippet_key: 'snippet_name',
                            customizations: [
                                {
                                    xpath: 'xpath_expr_1',
                                    resource: 'resource_value_1',
                                    type: text|img
                                },
                                ...
                            ],
                        },
                        ...
                    ],
                    ...
                }
            }
        """
        pages = data.get('pages', [])
        pages.append('homepage')
        theme = data.get('theme')
        industry = data.get('industry')
        industry_id = request.env['website.industry'].sudo().search([('name', '=', industry)], limit=1)
        customized_pages = {}
        for page in pages:
            snippet_list = self.get_snippet_list(page, theme)
            customized_pages[page] = [request.env['website.customization.rule'].sudo().get_customized_snippet(snippet, theme, page, industry_id.id) for snippet in snippet_list]
        resources = {
            'pages': customized_pages
        }
        return resources
