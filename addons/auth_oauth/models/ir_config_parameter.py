# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class IrConfig_Parameter(models.Model):
    _inherit = 'ir.config_parameter'

    _auth_oauth__provider_openerp = models.Ref('auth_oauth.provider_openerp', 'auth.oauth.provider', required=False)

    def init(self, force=False):
        super().init(force=force)
        if force:
            if not self._auth_oauth__provider_openerp:
                return
            dbuuid = self.sudo().get_str('database.uuid')
            self._auth_oauth__provider_openerp.write({'client_id': dbuuid})
