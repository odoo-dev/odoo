# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_cn_edi_aisino_identity_code = fields.Char(
        related='company_id.l10n_cn_edi_aisino_identity_code',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_platform_code = fields.Char(
        related='company_id.l10n_cn_edi_aisino_platform_code',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_gateway = fields.Selection(
        related='company_id.l10n_cn_edi_aisino_gateway',
        readonly=False,
    )
    l10n_cn_edi_aisino_username = fields.Char(
        related='company_id.l10n_cn_edi_aisino_username',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_password = fields.Char(
        related='company_id.l10n_cn_edi_aisino_password',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_allow_insecure_sandbox_signature = fields.Boolean(
        related='company_id.l10n_cn_edi_aisino_allow_insecure_sandbox_signature',
        readonly=False,
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_region_code = fields.Char(
        related='company_id.l10n_cn_edi_aisino_region_code',
        readonly=False,
        groups='base.group_system',
    )

    def action_l10n_cn_edi_aisino_test_connection(self):
        self.ensure_one()
        self.company_id._l10n_cn_edi_get_client().test_connection()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': self.env._("Aisino accepted the credentials of %s.", self.company_id.name),
                'next': {'type': 'ir.actions.act_window_close'},
            },
        }

    def action_l10n_cn_edi_aisino_login(self):
        self.ensure_one()
        return self.company_id._l10n_cn_edi_action_login()
