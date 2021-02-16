# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import fields, models, _
from odoo.addons.http_routing.models.ir_http import url_for, unslug


class Website(models.Model):
    _inherit = "website"

    website_slide_google_app_key = fields.Char('Google Doc Key')

    def get_suggested_controllers(self):
        suggested_controllers = super(Website, self).get_suggested_controllers()
        suggested_controllers.append((_('Courses'), url_for('/slides'), 'website_slides'))
        return suggested_controllers

    def _autocomplete_slides(self, search, limit, order, options):
        """See _autocomplete_pages"""
        model = self.env['slide.channel']
        with_description = options['displayDescription']
        with_date = options['displayDetail']
        my = options.get('my')
        search_tags = options.get('tag')
        domain = [self.website_domain()]
        if my:
            domain.append([('partner_ids', '=', self.env.user.partner_id.id)])
        if search_tags:
            ChannelTag = self.env['slide.channel.tag']
            try:
                tag_ids = list(filter(None, [unslug(tag)[1] for tag in search_tags.split(',')]))
                tags = ChannelTag.search([('id', 'in', tag_ids)]) if tag_ids else ChannelTag
            except Exception:
                tags = ChannelTag

            # Group by group_id
            grouped_tags = defaultdict(list)
            for tag in tags:
                grouped_tags[tag.group_id].append(tag)

            # OR inside a group, AND between groups.
            for group in grouped_tags:
                domain.append([('tag_ids', 'in', [tag.id for tag in grouped_tags[group]])])

        fields = ['name']
        if with_description:
            fields.append('description_short')
        domain = self._build_search_domain(domain, search, fields)
        results = model.search(
            domain,
            limit=min(20, limit),
            order=order
        )
        fields.append('website_url')
        if with_date:
            fields.append('slide_last_update')
        results_data = results.read(fields)
        mapping = {
            'name': {'name': 'name', 'type': 'text', 'match': True},
            'website_url': {'name': 'website_url', 'type': 'text'},
        }
        if with_description:
            mapping['description'] = {'name': 'description_short', 'type': 'html', 'match': True}
        if with_date:
            mapping['detail'] = {'name': 'slide_last_update', 'type': 'date'}
        return (model.search_count(domain), results_data, mapping)
