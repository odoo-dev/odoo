# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, _
from odoo.addons.http_routing.models.ir_http import url_for, unslug


class Website(models.Model):
    _inherit = "website"

    @api.model
    def page_search_dependencies(self, page_id=False):
        dep = super(Website, self).page_search_dependencies(page_id=page_id)

        page = self.env['website.page'].browse(int(page_id))
        path = page.url

        dom = [
            ('content', 'ilike', path)
        ]
        posts = self.env['blog.post'].search(dom)
        if posts:
            page_key = _('Blog Post')
            if len(posts) > 1:
                page_key = _('Blog Posts')
            dep[page_key] = []
        for p in posts:
            dep[page_key].append({
                'text': _('Blog Post <b>%s</b> seems to have a link to this page !', p.name),
                'item': p.name,
                'link': p.website_url,
            })

        return dep

    @api.model
    def page_search_key_dependencies(self, page_id=False):
        dep = super(Website, self).page_search_key_dependencies(page_id=page_id)

        page = self.env['website.page'].browse(int(page_id))
        key = page.key

        dom = [
            ('content', 'ilike', key)
        ]
        posts = self.env['blog.post'].search(dom)
        if posts:
            page_key = _('Blog Post')
            if len(posts) > 1:
                page_key = _('Blog Posts')
            dep[page_key] = []
        for p in posts:
            dep[page_key].append({
                'text': _('Blog Post <b>%s</b> seems to be calling this file !', p.name),
                'item': p.name,
                'link': p.website_url,
            })

        return dep

    def get_suggested_controllers(self):
        suggested_controllers = super(Website, self).get_suggested_controllers()
        suggested_controllers.append((_('Blog'), url_for('/blog'), 'website_blog'))
        return suggested_controllers

    def _autocomplete_blogs(self, search, limit, order, options):
        """See _autocomplete_pages"""
        model = self.env['blog.post']
        with_description = options['displayDescription']
        with_date = options['displayDetail']
        blog = options.get('blog')
        tags = options.get('tag')
        domain = [self.website_domain()]
        if blog:
            domain.append([('blog_id', '=', unslug(blog)[1])])
        if tags:
            active_tag_ids = [unslug(tag)[1] for tag in tags.split(',')] or []
            if active_tag_ids:
                active_tags = self.env['blog.tag'].browse(active_tag_ids).exists()
                domain.append([('tag_ids', 'in', active_tags.ids)])

        fields = ['name']
        if with_description:
            fields.append('subtitle')
        domain = self._build_search_domain(domain, search, fields)
        results = model.search(
            domain,
            limit=min(20, limit),
            order=order
        )
        fields.append('website_url')
        if with_date:
            fields.append('published_date')
        results_data = results.read(fields)
        mapping = {
            'name': {'name': 'name', 'type': 'text', 'match': True},
            'website_url': {'name': 'website_url', 'type': 'text'},
        }
        if with_description:
            mapping['description'] = {'name': 'subtitle', 'type': 'text', 'match': True}
        if with_date:
            mapping['detail'] = {'name': 'published_date', 'type': 'date'}
        return (model.search_count(domain), results_data, mapping)
