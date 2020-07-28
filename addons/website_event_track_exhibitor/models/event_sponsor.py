# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from datetime import datetime
from pytz import timezone, utc

from odoo import api, fields, models
from odoo.addons.http_routing.models.ir_http import slug
from odoo.addons.resource.models.resource import float_to_time
from odoo.tools import is_html_empty, remove_accents
from odoo.tools.translate import html_translate


class EventSponsor(models.Model):
    _name = 'event.sponsor'
    _inherit = [
        'event.sponsor',
        'website.published.mixin',
        'chat.room.mixin',
    ]
    _rec_name = 'name'
    _order = 'sponsor_type_id, sequence'

    # description
    subtitle = fields.Char('Slogan', help='Catchy marketing sentence for promote')
    is_exhibitor = fields.Boolean('Is Exhibitor')
    website_description = fields.Html(
        'Description', compute='_compute_website_description',
        sanitize_attributes=False, sanitize_form=True, translate=html_translate,
        readonly=False, store=True)
    # live mode
    hour_from = fields.Float('Opening hour', default=8.0)
    hour_to = fields.Float('End hour', default=18.0)
    is_in_opening_hours = fields.Boolean(
        'Within opening hours', compute='_compute_is_in_opening_hours')
    # chat room
    chat_room_id = fields.Many2one(readonly=False)
    room_name = fields.Char(readonly=False)
    # country information (related to ease frontend templates)
    country_id = fields.Many2one(
        'res.country', string='Country',
        related='partner_id.country_id', readonly=True)
    country_flag_url = fields.Char(
        string='Country Flag',
        compute='_compute_country_flag_url', compute_sudo=True)

    @api.onchange('is_exhibitor')
    def _onchange_is_exhibitor(self):
        """ Keep an explicit onchange to allow configuration of room names, even
        if this field is normally a related on chat_room_id.name. It is not a real
        computed field, an onchange used in form view is sufficient. """
        for sponsor in self:
            if sponsor.is_exhibitor and not sponsor.room_name:
                sponsor.room_name = self.env['chat.room']._default_name()

    @api.depends('partner_id')
    def _compute_website_description(self):
        for sponsor in self:
            if is_html_empty(sponsor.website_description):
                sponsor.website_description = sponsor.partner_id.website_description

    @api.depends('event_id.is_ongoing', 'hour_from', 'hour_to', 'event_id.date_begin', 'event_id.date_end')
    def _compute_is_in_opening_hours(self):
        """ Opening hours: hour_from and hour_to are given within event TZ or UTC.
        Now() must therefore be computed based on that TZ. """
        for sponsor in self:
            if not sponsor.event_id.is_ongoing:
                sponsor.is_in_opening_hours = False
            elif not sponsor.hour_from or not sponsor.hour_to:
                sponsor.is_in_opening_hours = True
            else:
                event_tz = timezone(sponsor.event_id.date_tz)
                # localize now, begin and end datetimes in event tz
                dt_begin = sponsor.event_id.date_begin.astimezone(event_tz)
                dt_end = sponsor.event_id.date_end.astimezone(event_tz)
                now_utc = utc.localize(fields.Datetime.now().replace(microsecond=0))
                now_tz = now_utc.astimezone(event_tz)

                # compute opening hours
                opening_from_tz = event_tz.localize(datetime.combine(now_tz.date(), float_to_time(sponsor.hour_from)))
                opening_to_tz = event_tz.localize(datetime.combine(now_tz.date(), float_to_time(sponsor.hour_to)))

                opening_from = max([dt_begin, opening_from_tz])
                opening_to = min([dt_end, opening_to_tz])

                sponsor.is_in_opening_hours = opening_from <= now_tz < opening_to

    @api.depends('partner_id.country_id.image')
    def _compute_country_flag_url(self):
        for sponsor in self:
            if sponsor.partner_id.country_id:
                sponsor.country_flag_url = self.env['website'].image_url(sponsor.partner_id.country_id, 'image', size=256)
            else:
                sponsor.country_flag_url = False

    @api.depends('name', 'event_id.name')
    def _compute_website_url(self):
        super(EventSponsor, self)._compute_website_url()
        for sponsor in self:
            if sponsor.id:  # avoid to perform a slug on a not yet saved record in case of an onchange.
                base_url = sponsor.event_id.get_base_url()
                sponsor.website_url = '%s/event/%s/exhibitor/%s' % (base_url, slug(sponsor.event_id), slug(sponsor))

    @api.model_create_multi
    def create(self, values_list):
        for values in values_list:
            if values.get('is_exhibitor'):
                if not values.get('room_name') and (values.get('name') or values.get('partner_id')):
                    name = values['name'] if values.get('name') else self.env['res.partner'].browse(values['partner_id']).name
                    sanitized_name = re.sub(r'[^\w+.]+', '-', remove_accents(name).lower())
                    final_name = 'odoo-exhibitor-%s' % sanitized_name
                    values['room_name'] = final_name
        return super(EventSponsor, self).create(values_list)

    def get_backend_menu_id(self):
        return self.env.ref('event.event_main_menu').id
