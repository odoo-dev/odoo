# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from pytz import timezone, utc

from odoo import api, fields, models
from odoo.addons.http_routing.models.ir_http import slug


class EventSponsor(models.Model):
    _name = 'event.sponsor'
    _inherit = [
        'event.sponsor',
        'website.published.mixin'
    ]
    _rec_name = 'name'
    _order = 'sponsor_type_id, sequence'

    # description
    name = fields.Char('Sponsor Name', compute='_compute_name', readonly=False, store=True)
    subtitle = fields.Char('Subtitle', help='Catchy marketing sentence for promote')
    image_256 = fields.Image(string="Logo (256)", related='partner_id.image_256', readonly=True)
    # live mode
    is_event_live = fields.Boolean(
        'Is Event Live', compute='_compute_event_start_data',
        help="Whether event has begun")
    event_start_remaining = fields.Integer(
        'Remaining before start', compute='_compute_event_start_data',
        help="Remaining time before event starts (hours)")

    @api.depends('partner_id')
    def _compute_name(self):
        for sponsor in self:
            if not sponsor.name:
                sponsor.name = sponsor.partner_id.name

    @api.depends('event_id.date_begin', 'event_id.date_end')
    def _compute_event_start_data(self):
        """ Compute start and remaining time. Do everything in UTC as we compute only
        time deltas here. """
        now = datetime.now(utc).replace(microsecond=0)
        for sponsor in self:
            date_begin_utc = utc.localize(sponsor.event_id.date_begin, is_dst=False)
            date_end_utc = utc.localize(sponsor.event_id.date_end, is_dst=False)
            sponsor.is_event_live = date_begin_utc <= now <= date_end_utc
            if date_begin_utc >= now:
                td = date_begin_utc - now
                sponsor.event_start_remaining = int(td.total_seconds() / 60)
            else:
                sponsor.event_start_remaining = 0

    @api.depends('name', 'event_id.name')
    def _compute_website_url(self):
        super(EventSponsor, self)._compute_website_url()
        for sponsor in self:
            if sponsor.id:  # avoid to perform a slug on a not yet saved record in case of an onchange.
                base_url = sponsor.event_id.get_base_url()
                sponsor.website_url = '%s/event/%s/exhibitor/%s' % (base_url, slug(sponsor.event_id), slug(sponsor))
