# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from dateutil.relativedelta import relativedelta

from odoo import models, _
from odoo.addons.http_routing.models.ir_http import url_for
from odoo.fields import Datetime

class Website(models.Model):
    _inherit = "website"

    def get_suggested_controllers(self):
        suggested_controllers = super(Website, self).get_suggested_controllers()
        suggested_controllers.append((_('Events'), url_for('/event'), 'website_event'))
        return suggested_controllers

    def _autocomplete_events(self, search, limit, order, options):
        """See _autocomplete_pages"""
        model = self.env['event.event']
        with_description = options['displayDescription']
        with_date = options['displayDetail']
        date = options.get('date', 'all')
        country = options.get('country')
        domain = [self.website_domain()]
        today = Datetime.today()

        def sdn(date):
            return Datetime.to_string(date.replace(hour=23, minute=59, second=59))

        def sd(date):
            return Datetime.to_string(date)

        if date == 'all':
            domain.append([("date_end", ">", sd(today))])
        elif date == 'today':
            domain.append([("date_end", ">", sd(today)), ("date_begin", "<", sdn(today))])
        elif date == 'month':
            first_day_of_the_month = today.replace(day=1)
            domain.append([
                ("date_end", ">=", sd(first_day_of_the_month)),
                ("date_begin", "<", sd(first_day_of_the_month + relativedelta(months=1)))
            ])
        elif date == 'old':
            domain.append([("date_end", "<", sd(today))])
        if country:
            if country == 'online':
                domain.append([("country_id", "=", False)])
            elif country != 'all':
                domain.append(['|', ("country_id", "=", int(country)), ("country_id", "=", False)])

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
        results_data = results.read(fields)
        if with_date:
            for event, record in zip(results, results_data):
                begin = self.env['ir.qweb.field.date'].record_to_html(event, 'date_begin', {})
                end = self.env['ir.qweb.field.date'].record_to_html(event, 'date_end', {})
                record['range'] = '%s~%s' % (begin, end)
        mapping = {
            'name': {'name': 'name', 'type': 'text', 'match': True},
            'website_url': {'name': 'website_url', 'type': 'text'},
        }
        if with_description:
            mapping['description'] = {'name': 'subtitle', 'type': 'text', 'match': True}
        if with_date:
            mapping['detail'] = {'name': 'range', 'type': 'html'}
        return (model.search_count(domain), results_data, mapping)
