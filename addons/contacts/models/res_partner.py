# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResPartner(models.Model):
    _inherit = "res.partner"

    _contacts__menu_contacts = models.Ref('contacts.menu_contacts', 'ir.ui.menu')

    def _get_backend_root_menu_ids(self):
        return super()._get_backend_root_menu_ids() + [self._contacts__menu_contacts.id]
