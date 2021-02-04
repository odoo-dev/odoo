# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import random
import re

from odoo import http, tools
from odoo.http import request
from odoo.modules.module import get_resource_path

ILLUSTRATION_THEMES = ['theme_paptic', 'theme_cobalt']

SNIPPET_LISTS = {
    'homepage': {
        "theme_anelusia": ["s_cover", "s_images_wall", "s_media_list", "s_company_team"],
        "theme_artists": ["s_parallax", "s_text_image", "s_three_columns", "s_call_to_action"],
        "theme_avantgarde": ["s_title", "s_carousel", "s_text_image", "s_references", "s_quotes_carousel"],
        "theme_beauty": ["s_cover", "s_text_image", "s_title", "s_company_team", "s_call_to_action"],
        "theme_bewise": ["s_cover", "s_call_to_action", "s_text_image", "s_numbers", "s_image_text", "s_quotes_carousel", "s_company_team"],
        "theme_bistro": ["s_cover", "s_features", "s_picture", "s_product_catalog", "s_text_block", "s_quotes_carousel"],
        "theme_bookstore": ["s_title", "s_three_columns", "s_picture", "s_product_list", "s_text_image", "s_call_to_action"],
        "theme_clean": ["s_cover", "s_carousel", "s_text_image", "s_three_columns", "s_call_to_action"],
        "theme_cobalt": ["s_text_image", "s_references", "s_text_image", "s_three_columns", "s_picture"],
        "theme_enark": ["s_banner", "s_picture", "s_text_image", "s_media_list", "s_call_to_action"],
        "theme_graphene": ["s_cover", "s_text_image", "s_three_columns", "s_company_team", "s_call_to_action"],
        "theme_kea": ["s_cover", "s_picture", "s_image_text", "s_text_image", "s_three_columns", "s_meida_list", "s_references"],
        "theme_kiddo": ["s_banner", "s_image_text", "s_product_list", "s_three_columns", "s_call_to_action"],
        "theme_loftspace": ["s_cover", "s_text_image", "s_title", "s_picture", "s_three_columns", "s_call_to_action"],
        "theme_monglia": ["s_cover", "s_title", "s_media_list", "s_carousel", "s_call_to_action", "s_text_image", "s_image_text"],
        "theme_nano": ["s_carousel", "s_features", "s_image_text", "s_text_block", "s_three_columns"],
        "theme_notes": ["s_carousel", "s_image_text", "s_media_list", "s_company_team"],
        "theme_odoo_experts": ["s_banner", "s_image_text", "s_media_list", "s_call_to_action"],
        "theme_orchid": ["s_cover", "s_image_text", "s_text_image", "s_three_columns", "s_quotes_carousel", "s_call_to_action"],
        "theme_paptic": ["s_text_image", "s_references", "s_image_text", "s_three_columns"],
        "theme_real_estate": ["s_banner", "s_picture", "s_image_text", "s_three_columns", "s_quotes_carousel"],
        "theme_treehouse": ["s_cover", "s_text_image", "s_title", "s_three_columns", "s_call_to_action"],
        "theme_vehicle": ["s_cover", "s_text_image", "s_masonry_block", "s_image_text", "s_table_of_content", "s_call_to_action", "s_references"],
        "theme_yes": ["s_carousel", "s_picture", "s_masonry_block", "s_three_columns", "s_quotes_carousel", "s_call_to_action"],
        "theme_zap": ["s_banner", "s_numbers", "s_features", "s_masonry_block", "s_references"],
        "default": ["s_cover", "s_text_image", "s_numbers"],
    },
    'about_us': {
        "default": ["s_text_image", "s_image_text", "s_title", "s_company_team"],
    },
    'our_services': {
        "default": ["s_three_columns", "s_quotes_carousel", "s_references"],
    },
    'pricing': {
        "theme_bistro": ["s_text_image", "s_product_catalog"],
        "default": ["s_comparisons"],
    },
    'privacy_policy': {
        "default": ["s_faq_collapse"],
    },
}


class WebsiteService(http.Controller):

    @http.route('/website/industries', type='json', auth='public', csrf=False)
    def website_get_industries(self, **kw):
        industries = request.env['website.industry'].sudo().search_read([], ['name', 'label'])
        return {
            'industries': industries
        }

    def process_svg(self, theme, colors, images):
        svg = None

        shape_path = get_resource_path('website_service', 'static', 'shapes', '{}_preview.svg'.format(theme))
        if not shape_path:
            shape_path = get_resource_path('website_service', 'static', 'shapes', 'theme_bistro_preview.svg')
            #raise werkzeug.exceptions.NotFound()
        with tools.file_open(shape_path, 'r') as file:
            svg = file.read()

        default_colors = {
            1: '#3AADAA',
            2: '#7C6576',
            3: '#F6F6F6',
            4: '#FFFFFF',
            5: '#383E45',
        }
        default_images = {
            1: '#IMAGE-URL-1',
            2: '#IMAGE-URL-2',
        }

        color_mapping = {default_colors[color_number]: color_value for color_number, color_value in colors.items()}
        color_regex = '(?i)%s' % '|'.join('(%s)' % color for color in color_mapping.keys())
        image_mapping = {default_images[image_number]: image_url for image_number, image_url in images.items()}
        image_regex = '(?i)%s' % '|'.join('(%s)' % image for image in image_mapping.keys())

        def subber_maker(mapping):
            def subber(match):
                key = match.group().upper()
                return mapping[key] if key in mapping else key
            return subber

        svg = re.sub(color_regex, subber_maker(color_mapping), svg)
        svg = re.sub(image_regex, subber_maker(image_mapping), svg)
        return svg

    @http.route('/website/recommended_themes', type='json', auth='public', csrf=False)
    def website_recommended_themes(self, palette=None, industry_name=None, **kw):
        industry_id = request.env['website.industry'].sudo().search([('name', '=', industry_name)], limit=1)
        themes = ['theme_avantgarde', 'theme_cobalt', 'theme_bistro']
        
        if industry_id:
            link_ids = request.env['website.industry.theme.link'].sudo().search([('industry_id', '=', industry_id.id)])
            themes[:len(link_ids)] = [link_id.theme_id.name for link_id in link_ids]
        if not any([itheme in themes for itheme in ILLUSTRATION_THEMES]):
            themes[2] = random.choice(ILLUSTRATION_THEMES)
        svg_colors = {}
        if palette:
            for k, v in palette.items():
                color_match = re.match('^color([1-5])$', k)
                if color_match:
                    svg_colors[int(color_match.group(1))] = v
        images = {
            1: 'https://images.unsplash.com/photo-1615859499328-380adaffddb3?ixid=MXwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=157&q=80',
            2: 'https://images.unsplash.com/photo-1615859499328-380adaffddb3?ixid=MXwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHw%3D&ixlib=rb-1.2.1&auto=format&fit=crop&w=157&q=80'
        }
        svgs = []
        for theme in themes:
            svg = self.process_svg(theme, svg_colors, images)
            svgs.append(svg)
        return {
            'themes': themes,
            'svgs': svgs
        }

    def get_snippet_list(self, page_code, theme):
        page_lists = SNIPPET_LISTS.get(page_code)
        if page_lists:
            return ['website.'+snippet for snippet in page_lists.get(theme, page_lists.get('default'))]
        return []

    @http.route('/website/custom_resources', type='json', auth='public', csrf=False)
    def website_custom_resources(self, data=None, **kw):
        pages = data.get('pages', [])
        pages.append('homepage')
        theme = data.get('theme')
        industry = data.get('industry')
        industry_id = request.env['website.industry'].sudo().search([('name', '=', industry)], limit=1)
        customized_pages = {}
        for page in pages:
            snippet_list = self.get_snippet_list(page, theme)
            customized_pages[page] = snippet_list
        customized_images = request.env['website.industry.image'].sudo().get_industry_images(industry_id.id)
        resources = {
            'pages': customized_pages,
            'images': customized_images,
        }
        return resources
