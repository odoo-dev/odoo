# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.addons.http_routing.models.ir_http import slug


class EventEvent(models.Model):
    _inherit = "event.event"

    exhibitor_menu = fields.Boolean(
        string='Showcase Exhibitors', compute='_compute_exhibitor_menu',
        readonly=False, store=True)
    exhibitor_menu_ids = fields.One2many(
        'website.event.menu', 'event_id', string='Exhibitors Menus',
        domain=[('menu_type', '=', 'exhibitor')])

    @api.depends('event_type_id', 'website_menu', 'exhibitor_menu')
    def _compute_exhibitor_menu(self):
        for event in self:
            if event.event_type_id and event.event_type_id != event._origin.event_type_id:
                event.exhibitor_menu = event.event_type_id.exhibitor_menu
            elif event.website_menu and event.website_menu != event._origin.website_menu:
                event.exhibitor_menu = True
            elif not event.website_menu or not event.exhibitor_menu:
                event.exhibitor_menu = False

    # ------------------------------------------------------------
    # WEBSITE MENU MANAGEMENT
    # ------------------------------------------------------------

    def toggle_exhibitor_menu(self, val):
        self.exhibitor_menu = val

    def _get_menu_update_fields(self):
        update_fields = super(EventEvent, self)._get_menu_update_fields()
        update_fields += ['exhibitor_menu']
        return update_fields

    def _update_website_menus(self, split_to_update=None):
        super(EventEvent, self)._update_website_menus(split_to_update=split_to_update)
        for event in self:
            if not split_to_update or event in split_to_update.get('exhibitor_menu'):
                event._update_website_menu_entry('exhibitor_menu', 'exhibitor_menu_ids', '_get_exhibitor_menu_entries')

    def _get_menu_type_field_matching(self):
        res = super(EventEvent, self)._get_menu_type_field_matching()
        res['exhibitor'] = 'exhibitor_menu'
        return res

    def _get_exhibitor_menu_entries(self):
        self.ensure_one()
        res = [(_('Exhibitors'), '/event/%s/exhibitors' % slug(self), False, 60, 'exhibitor')]
        return res
