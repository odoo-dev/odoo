# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo import api, models


class WebsiteMenu(models.Model):
    _inherit = "website.menu"

    def unlink(self):
        """ Override to synchronize event configuration fields with menu deletion. """
        event_updates = {}
        website_event_menus = self.env['website.event.menu'].search([('menu_id', 'in', self.ids)])
        for event_menu in website_event_menus:
            to_update = event_updates.setdefault(event_menu.event_id, list())
            for menu_type, fname in event_menu.event_id._get_menu_type_field_matching().items():
                if event_menu.menu_type == menu_type:
                    to_update.append(fname)

        unlinked_menus = self

        if website_event_menus:
            # Manually remove website_event_menus to call their ``unlink`` method. Otherwise
            # super unlinks at db level and skip model-specific behavior.
            # Since website.event.menu unlink removes:
            # - the related ir.ui.view records
            # - which cascade deletes the website.page records
            # - which cascade deletes the website.menu records
            # -> we only call super unlink on the remaining website.menu records
            cascaded_menus = website_event_menus.view_id.page_ids.menu_ids
            unlinked_menus = self - cascaded_menus
            website_event_menus.unlink()

        res = super(WebsiteMenu, unlinked_menus).unlink()

        # update events
        for event, to_update in event_updates.items():
            if to_update:
                event.write(dict((fname, False) for fname in to_update))

        return res

    @api.model
    def save(self, website_id, data):
        """
        This method takes a data argument that follows the following format:
         [
           { 'id': 4, url: '/mypage' },
           { 'id': 'menu_xxx_...', url: '/anotherpage' }
         ]

         The new menu entries are identified by their ID being a string and not an integer value.
         Note that when going through super() call, those id entries are replaced by their created
         menu ID (integer), so we need to identify new menu entries before calling super.

         Override purpose:

         All sub-menus of an event are children of a 'main' website.menu, linking to the event main page.

         We abuse that information to determine if the added menu is part of an event or not:
         If we find a website.event.menu item that has the same parent as the menu we just created
         -> it means that we just created a menu inside an event.

         When requested through the `return_menu_ids` context key, return a mapping
         between temporary menu IDs and database IDs.
        """
        temporary_menus = {
            menu['id']: menu
            for menu in data['data']
            if isinstance(menu['id'], str)
        }
        old_menu_ids = [menu['id'] for menu in data['data'] if isinstance(menu['id'], int)]
        has_new_menus = bool(temporary_menus)

        res = super().save(website_id, data)

        id_mapping = {
            temporary_id: menu['id']
            for temporary_id, menu in temporary_menus.items()
        }

        if not has_new_menus:
            if self.env.context.get('return_menu_ids'):
                return {'result': res, 'id_mapping': {}}
            return res

        menus_by_parent_id = {}
        for menu in data['data']:
            if not menu.get('parent_id'):
                continue
            if not menus_by_parent_id.get(menu['parent_id']):
                menus_by_parent_id[menu['parent_id']] = []
            menus_by_parent_id[menu['parent_id']].append(menu)

        for parent_id, menus in menus_by_parent_id.items():
            new_menus = filter(lambda menu: menu['id'] not in old_menu_ids, menus)
            if not new_menus:
                continue
            parent = self.env['website.menu'].browse(parent_id)
            while parent.parent_id:  # get the top-most parent to handle sub-menus
                parent = parent.parent_id
            if parent_event_menu := self.env['website.event.menu'].search([
                ('menu_id.parent_id', '=', parent.id)
            ], limit=1):
                event_url = parent_event_menu.event_id.website_url.rstrip('/')
                event_menu_values = []
                for new_menu in new_menus:
                    menu_record = self.env['website.menu'].browse(new_menu['id'])
                    menu_record_url = menu_record.url.lstrip("/")
                    if not menu_record_url or menu_record_url == '#':
                        # prevent blank URLs, use 't' prefix to avoid slug syntax
                        menu_record_url = f"t{int(datetime.now().timestamp())}"
                    menu_record.write({
                        'url': f'{event_url}/page/{menu_record_url}'
                    })
                    event_menu_values.append({
                        'menu_id': menu_record.id,
                        'event_id': parent_event_menu.event_id.id,
                        'menu_type': 'other',
                    })
                # if the current user can create website.menu, then he should be able to
                # create website.event.menu (e.g: website designer group)
                self.env['website.event.menu'].sudo().create(event_menu_values)

        if self.env.context.get('return_menu_ids'):
            return {'result': res, 'id_mapping': id_mapping}
        return res