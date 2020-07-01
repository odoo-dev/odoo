# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import models, _
from odoo.addons.http_routing.models.ir_http import unslug


class WebsiteMenu(models.Model):
    _inherit = "website.menu"

    def unlink(self):
        """ Override to synchronize event configuration fields and created views
        with menu deletion. This should be cleaned in upcoming versions.

        Purpose is to clean ir.ui.view when removing event menus. As those are not
        pages they could bloat db. """
        for menu in self:
            if '/event/' in menu.url and '/page' in menu.url:
                event = None
                slugified_event = re.search("(?:/event/)(.*)(?:/page/)(.*)", menu.url)
                if slugified_event and slugified_event.group(1):
                    event_name, event_id = unslug(slugified_event.group(1))
                event = self.env['event.event'].browse(event_id).exists()
                if not event:
                    continue
                if menu.name in [_('Introduction'), _('Location')]:
                    self.env['ir.ui.view'].with_context(_force_unlink=True).search([('name', '=', menu.name + ' ' + event.name)]).unlink()
        return super(WebsiteMenu, self).unlink()
