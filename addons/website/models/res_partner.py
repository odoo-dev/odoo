# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug.urls

from odoo import models, fields, api


class ResPartner(models.Model):
    _name = 'res.partner'
    _inherit = ['res.partner', 'website.published.multi.mixin']
    # see `res.users`: the partner of a website public user is read on every
    # frontend request, and so is the partner of the company (the fiscal
    # position, the taxes...).  Neither ever changes.
    _clear_cache_name = 'default'

    @property
    def _cached_data_domain(self):
        website = self.env['website'].sudo().get_all()
        return [('id', 'in', (
            website.user_id.partner_id | website.company_id.partner_id
        ).ids)]

    @property
    def _cached_data_fields(self):
        return self._get_cacheable_field_names()

    @api.ormcache(cache='default')
    def _cached_data(self):
        # method is overridden to use the cache 'default' instead of 'stable'
        # hack: retrieve the original method to skip the ormcache wrapper
        return super()._cached_data.__cache__.method(self)

    visitor_ids = fields.One2many('website.visitor', 'partner_id', string='Visitors')

    def google_map_img(self, zoom=8, width=298, height=298):
        google_maps_api_key = self.env.website.google_maps_api_key
        if not google_maps_api_key:
            return False
        params = {
            'center': '%s, %s %s, %s' % (self.street or '', self.city or '', self.zip or '', self.country_id and self.country_id.display_name or ''),
            'size': "%sx%s" % (width, height),
            'zoom': zoom,
            'sensor': 'false',
            'key': google_maps_api_key,
        }
        return '//maps.googleapis.com/maps/api/staticmap?' + werkzeug.urls.url_encode(params)

    def google_map_link(self, zoom=10):
        params = {
            'q': '%s, %s %s, %s' % (self.street or '', self.city or '', self.zip or '', self.country_id and self.country_id.display_name or ''),
            'z': zoom,
        }
        return 'https://maps.google.com/maps?' + werkzeug.urls.url_encode(params)

    @api.depends('website_id')
    @api.depends_context('display_website')
    def _compute_display_name(self):
        super()._compute_display_name()
        if not self.env.context.get('display_website') or not self.env.user.has_group('website.group_multi_website'):
            return
        for partner in self:
            if partner.website_id:
                partner.display_name += f' [{partner.website_id.name}]'
