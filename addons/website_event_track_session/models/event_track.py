# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
from pytz import timezone, utc

from odoo import api, fields, models


class EventTrack(models.Model):
    _inherit = "event.track"

    # Call to action
    website_cta = fields.Boolean('CTA Button')
    website_cta_title = fields.Char('CTA Title')
    website_cta_url = fields.Char('CTA Url')
    website_cta_delay = fields.Integer('CTA Delay')
    # time information for session/live mode
    is_event_live = fields.Boolean(
        'Is Event Live', compute='_compute_event_time_data',
        help="Event has started and is ongoing")
    is_event_done = fields.Boolean(
        'Is Event Done', compute='_compute_event_time_data',
        help="Event is finished ")
    event_start_remaining = fields.Integer(
        'Minutes before event starts', compute='_compute_event_time_data',
        help="Remaining time before event starts (minutes)")
    is_track_live = fields.Boolean(
        'Is Track Live', compute='_compute_track_time_data',
        help="Track has started and is ongoing.")
    is_track_done = fields.Boolean(
        'Is Track Done', compute='_compute_track_time_data',
        help="Track is finished.")
    track_start_remaining = fields.Integer(
        'Minutes before track starts', compute='_compute_track_time_data',
        help="Remaining time before event starts (minutes)")
    is_cta_live = fields.Boolean(
        'Is CTA Live', compute='_compute_cta_time_data',
        help="CTA button is available")
    website_cta_start_remaining = fields.Boolean(
        'Minutes before CTA starts', compute='_compute_cta_time_data',
        help="Remaining time before event starts (minutes)")

    @api.depends('event_id.date_begin', 'event_id.date_end')
    def _compute_event_time_data(self):
        """ Compute start and remaining time for track's event. Do everything in
        UTC as we compute only time deltas here. """
        now = datetime.now(utc).replace(microsecond=0)
        for track in self:
            date_begin_utc = utc.localize(track.event_id.date_begin, is_dst=False)
            date_end_utc = utc.localize(track.event_id.date_end, is_dst=False)
            track.is_event_live = date_begin_utc <= now <= date_end_utc
            track.is_event_done = now > date_end_utc
            if date_begin_utc >= now:
                td = date_begin_utc - now
                track.event_start_remaining = int(td.total_seconds() / 60)
            else:
                track.event_start_remaining = 0

    @api.depends('date', 'date_end')
    def _compute_track_time_data(self):
        """ Compute start and remaining time for track itself. Do everything in
        UTC as we compute only time deltas here. """
        now = datetime.now(utc).replace(microsecond=0)
        for track in self:
            date_begin_utc = utc.localize(track.date, is_dst=False)
            date_end_utc = utc.localize(track.date_end, is_dst=False)
            track.is_track_live = date_begin_utc <= now <= date_end_utc
            track.is_track_done = now > date_end_utc
            if date_begin_utc >= now:
                td = date_begin_utc - now
                track.track_start_remaining = int(td.total_seconds() / 60)
            else:
                track.track_start_remaining = 0

    @api.depends('date', 'date_end', 'website_cta', 'website_cta_delay')
    def _compute_cta_time_data(self):
        """ Compute start and remaining time for track itself. Do everything in
        UTC as we compute only time deltas here. """
        now = datetime.now(utc).replace(microsecond=0)
        for track in self:
            if not track.website_cta:
                track.is_cta_live = track.website_cta_start_remaining = False
                continue

            date_begin_utc = utc.localize(track.date, is_dst=False) + timedelta(minutes=track.website_cta_delay or 0)
            date_end_utc = utc.localize(track.date_end, is_dst=False)
            track.is_cta_live = date_begin_utc <= now <= date_end_utc
            if date_begin_utc >= now:
                td = date_begin_utc - now
                track.website_cta_start_remaining = int(td.total_seconds() / 60)
            else:
                track.website_cta_start_remaining = 0
