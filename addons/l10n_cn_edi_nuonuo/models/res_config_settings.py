# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_cn_edi_nuonuo_app_key = fields.Char(related='company_id.l10n_cn_edi_nuonuo_app_key', readonly=False)
    l10n_cn_edi_nuonuo_app_secret = fields.Char(
        related='company_id.l10n_cn_edi_nuonuo_app_secret',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_nuonuo_token = fields.Char(
        related='company_id.l10n_cn_edi_nuonuo_token',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_nuonuo_extension_number = fields.Char(
        related='company_id.l10n_cn_edi_nuonuo_extension_number',
        readonly=False,
    )
    l10n_cn_edi_nuonuo_ele_account = fields.Char(related='company_id.l10n_cn_edi_nuonuo_ele_account', readonly=False)

    def action_l10n_cn_edi_nuonuo_test_connection(self):
        self.ensure_one()
        self.company_id._l10n_cn_edi_get_client().test_connection()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': self.env._("Nuonuo accepted the credentials of %s.", self.company_id.name),
                'next': {'type': 'ir.actions.act_window_close'},
            },
        }

    def action_l10n_cn_edi_nuonuo_login(self):
        self.ensure_one()
        return self.company_id._l10n_cn_edi_action_login()
