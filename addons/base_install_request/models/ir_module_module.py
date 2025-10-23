# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, _
from odoo.tools.parse_version import parse_version


class IrModuleModule(models.Model):
    _inherit = 'ir.module.module'

    requested_version = fields.Char('Requested Version', readonly=True)

    def action_open_install_request(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'target': 'new',
            'name': _('Activation Request of "%s"', self.shortdesc),
            'views': [(False, 'form')],
            'res_model': 'base.module.install.request',
            'context': {'default_module_id': self.id},
        }

    def _check_module_version(self):
        # Don't suggest to request if already requested
        if (
            not self.requested_version or
            parse_version(self.installed_version) > parse_version(self.requested_version)
        ):
            super()._check_module_version()

    def _request_module_update(self):
        if not self.env.user.has_group('base.group_system'):
            self.env.user._bus_send('simple_notification', {
                'type': 'info',
                'sticky': True,
                'message': self.env._("The following module is out of date: %s", self.shortdesc),
                'buttons': [{
                    'name': self.env._("Request an update"),
                    'action': self.action_open_install_request(),
                }],
            })
        else:
            super()._request_module_update()
