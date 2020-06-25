# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval
from random import randint
from werkzeug.exceptions import NotFound, Forbidden

from odoo import exceptions, http
from odoo.addons.website_event_track.controllers.main import WebsiteEventTrackController
from odoo.http import request
from odoo.osv import expression


class ExhibitorController(WebsiteEventTrackController):

    def _get_event_sponsors_base_domain(self, event):
        search_domain_base = [
            ('event_id', '=', event.id),
        ]
        if not request.env.user.has_group('event.group_event_user'):
            search_domain_base = expression.AND([search_domain_base, [('is_published', '=', True)]])
        return search_domain_base

    # ------------------------------------------------------------
    # MAIN PAGE
    # ------------------------------------------------------------

    @http.route(['/event/<model("event.event"):event>/exhibitors'], type='http', auth="public", website=True, sitemap=False)
    def event_exhibitors(self, event, **searches):
        if not event.can_access_from_current_website():
            raise NotFound()

        return request.render(
            "website_event_track_exhibitor.event_exhibitors",
            self._event_exhibitors_get_values(event, **searches)
        )

    def _event_exhibitors_get_values(self, event, **searches):
        # init and process search terms
        searches.setdefault('search', '')
        searches.setdefault('countries', '')
        searches.setdefault('sponsorhips', '')
        search_domain_base = self._get_event_sponsors_base_domain(event)
        search_domain = search_domain_base

        # search on content
        if searches.get('search'):
            search_domain = expression.AND([
                search_domain,
                ['|', ('name', 'ilike', searches['search']), ('website_description', 'ilike', searches['search'])]
            ])

        # search on countries
        search_countries = self._get_search_countries(searches['countries'])
        if search_countries:
            search_domain = expression.AND([
                search_domain,
                [('partner_id.country_id', 'in', search_countries.ids)]
            ])

        # search on sponsor types
        search_sponsorhips = self._get_search_sponsorships(searches['sponsorhips'])
        if search_sponsorhips:
            search_domain = expression.AND([
                search_domain,
                [('sponsor_type_id', 'in', search_sponsorhips.ids)]
            ])

        # fetch data to display; use sudo to allow reading partner info, be sure domain is correct
        event = event.with_context(tz=event.date_tz or 'UTC')
        sponsors = request.env['event.sponsor'].sudo().search(search_domain)
        sponsors_all = request.env['event.sponsor'].sudo().search(search_domain_base)
        sponsor_types = request.env['event.sponsor.type'].sudo().search([])
        sponsor_countries = sponsors_all.mapped('partner_id.country_id')
        # organize sponsors into categories to help display
        sponsor_categories = dict()
        for sponsor in sponsors:
            if not sponsor_categories.get(sponsor.sponsor_type_id):
                sponsor_categories[sponsor.sponsor_type_id] = request.env['event.sponsor'].sudo()
            sponsor_categories[sponsor.sponsor_type_id] |= sponsor
        sponsor_categories = [
            dict({
                'sponsorship': sponsor_category,
                'sponsors': sponsors,
            }) for sponsor_category, sponsors in sponsor_categories.items()]

        # return rendering values
        return {
            # event information
            'event': event,
            'main_object': event,
            'sponsor_categories': sponsor_categories,
            'hide_sponsors': True,
            # search information
            'searches': searches,
            'search_key': searches['search'],
            'search_countries': search_countries,
            'search_sponsorhips': search_sponsorhips,
            'sponsor_types': sponsor_types,
            'sponsor_countries': sponsor_countries,
            # environment
            'hostname': request.httprequest.host.split(':')[0],
        }

    # ------------------------------------------------------------
    # FRONTEND FORM
    # ------------------------------------------------------------

    @http.route(['/event/<model("event.event"):event>/exhibitor/<model("event.sponsor"):sponsor>'], type='http', auth="public", website=True, sitemap=False)
    def event_exhibitor(self, event, sponsor, **options):
        if not event.can_access_from_current_website():
            raise NotFound()

        try:
            sponsor.check_access_rule('read')
        except exceptions.AccessError:
            raise Forbidden()
        sponsor = sponsor.sudo()

        if 'widescreen' not in options and sponsor.chat_room_id and sponsor.is_in_opening_hours:
            options['widescreen'] = True

        return request.render(
            "website_event_track_exhibitor.event_exhibitor_main",
            self._event_exhibitor_get_values(event, sponsor, **options)
        )

    def _event_exhibitor_get_values(self, event, sponsor, **options):
        # search for exhibitor list
        search_domain_base = self._get_event_sponsors_base_domain(event)
        search_domain_base = expression.AND([
            search_domain_base,
            [('id', '!=', sponsor.id)]
        ])
        sponsors_other = request.env['event.sponsor'].sudo().search(search_domain_base)
        current_country = sponsor.partner_id.country_id

        sponsors_other = sponsors_other.sorted(key=lambda sponsor: (
            sponsor.partner_id.country_id == current_country,
            -1 * sponsor.sponsor_type_id.sequence,
            randint(0, 20)
        ), reverse=True)

        option_widescreen = options.get('widescreen', False)
        option_widescreen = bool(option_widescreen) if option_widescreen != '0' else False

        return {
            # event information
            'event': event,
            'main_object': sponsor,
            'sponsor': sponsor,
            'hide_sponsors': True,
            # sidebar
            'sponsors_other': sponsors_other,
            # options
            'option_widescreen': option_widescreen,
            'option_can_edit': request.env.user.has_group('event.group_event_manager'),
        }

    # ------------------------------------------------------------
    # TOOLS
    # ------------------------------------------------------------

    def _get_search_countries(self, country_search):
        # TDE FIXME: make me generic (slides, event, ...)
        try:
            country_ids = literal_eval(country_search)
        except Exception:
            countries = request.env['res.country'].sudo()
        else:
            # perform a search to filter on existing / valid tags implicitly
            countries = request.env['res.country'].sudo().search([('id', 'in', country_ids)])
        return countries

    def _get_search_sponsorships(self, sponsorship_search):
        # TDE FIXME: make me generic (slides, event, ...)
        try:
            sponsorship_ids = literal_eval(sponsorship_search)
        except Exception:
            sponsorships = request.env['event.sponsor.type'].sudo()
        else:
            # perform a search to filter on existing / valid tags implicitly
            sponsorships = request.env['event.sponsor.type'].sudo().search([('id', 'in', sponsorship_ids)])
        return sponsorships
