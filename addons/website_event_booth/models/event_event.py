# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventEvent(models.Model):
    _inherit = ['event.event']

    exhibition_map = fields.Image(string='Exhibition Map', max_width=1024, max_height=1024)
    # frontend menu management
    booth_menu = fields.Boolean(
        string='Booth Register', compute='_compute_booth_menu',
        readonly=False, store=True)
    booth_menu_ids = fields.One2many(
        'website.event.menu', 'event_id', string='Event Booths Menus',
        domain=[('menu_type', '=', 'booth')])

    @api.depends('event_type_id', 'website_menu')
    def _compute_booth_menu(self):
        for event in self:
            if event.event_type_id and event.event_type_id != event._origin.event_type_id:
                event.booth_menu = event.event_type_id.booth_menu
            elif event.website_menu and (event.website_menu != event._origin.website_menu or not event.booth_menu):
                event.booth_menu = True
            elif not event.website_menu:
                event.booth_menu = False

    # ------------------------------------------------------------
    # WEBSITE MENU MANAGEMENT
    # ------------------------------------------------------------

    def toggle_booth_menu(self, val):
        self.booth_menu = val

    def _get_menu_update_fields(self):
        return super()._get_menu_update_fields() + ['booth_menu']

    def _update_website_menus(self, menus_update_by_field=None):
        super()._update_website_menus(menus_update_by_field=menus_update_by_field)
        for event in self:
            if event.menu_id and (not menus_update_by_field or event in menus_update_by_field.get('booth_menu')):
                event._update_website_menu_entry('booth_menu', 'booth_menu_ids', 'booth')

    def _get_menu_type_field_matching(self):
        res = super()._get_menu_type_field_matching()
        res['booth'] = 'booth_menu'
        return res

    def _get_website_menu_entries(self):
        self.ensure_one()
        menu_entries = super()._get_website_menu_entries()
        # Check if 'Exhibitors' menu entry already exists
        exhibitor_menu_exists = any(entry[0] == self.env._('Exhibitors') for entry in menu_entries)
        # If 'Exhibitors' menu entry doesn't exist, add it
        if not exhibitor_menu_exists:
            menu_entries.extend([
                (self.env._('Exhibitors'), '#', False, 55, 'booth', False),
                (self.env._('Become exhibitor'), '/event/%s/booth' % self.env['ir.http']._slug(self), False, 90, 'booth', 'booth')
            ])
        else:
            menu_entries.append(
                (self.env._('Become exhibitor'), '/event/%s/booth' % self.env['ir.http']._slug(self), False, 90, 'booth', 'exhibitor')
            )
        return menu_entries
