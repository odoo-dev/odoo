# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models
from odoo.exceptions import UserError

from odoo.addons.l10n_cn_edi_aisino.tools import AisinoClient


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_cn_edi_aisino_identity_code = fields.Char(
        string="Aisino Identity Code (授权码)",
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_platform_code = fields.Char(
        string="Aisino Platform Code (组织编码)",
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_gateway = fields.Selection(
        selection=[('test', "Sandbox"), ('prod', "Production")],
        string="Aisino Gateway",
        default='test',
        required=True,
    )
    l10n_cn_edi_aisino_username = fields.Char(
        string="E-Tax Username (电子税务局账号)",
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_password = fields.Char(
        string="E-Tax Password (电子税务局密码)",
        groups='base.group_system',
    )
    l10n_cn_edi_aisino_allow_insecure_sandbox_signature = fields.Boolean(
        string="Allow insecure sandbox signature responses",
        groups='base.group_system',
        help="Sandbox-only workaround for unresolved response-signing mismatch. Keep disabled in production.",
    )
    l10n_cn_edi_aisino_region_code = fields.Char(
        string="Aisino Region Code (地区编码)",
        groups='base.group_system',
        help="Optional tax-bureau region code (dqbm), e.g. 4403.",
    )
    l10n_cn_edi_aisino_relogin = fields.Boolean(
        string="Aisino Forced Relogin",
        copy=False,
        groups='base.group_system',
        help="Set when issuing returned 3203: the next tax-bureau login must be forced (reloginflag).",
    )

    def _l10n_cn_edi_get_client(self):
        # EXTENDS 'l10n_cn_edi'
        self.ensure_one()
        return AisinoClient(self)

    def _l10n_cn_edi_is_ready(self):
        # EXTENDS 'l10n_cn_edi'
        self.ensure_one()
        company = self.sudo()
        return bool(
            company.vat
            and company.l10n_cn_edi_aisino_identity_code
            and company.l10n_cn_edi_aisino_platform_code,
        )

    def _l10n_cn_edi_action_login(self, invoices=None):
        # EXTENDS 'l10n_cn_edi'
        self.ensure_one()
        if self not in self.env.user.company_ids:
            raise UserError(self.env._("You cannot operate Aisino login for this company."))
        client = self._l10n_cn_edi_get_client()
        client.ensure_ready()
        if invoices and invoices.filtered(lambda move: move.company_id != self):
            raise UserError(self.env._("Invoices must belong to the selected company."))
        try:
            session_state = client.get_session_state()
        except UserError:
            session_state = 'login'
        if session_state == 'verify':
            raise UserError(client._verify_error())
        wizard = self.env['l10n_cn_edi_aisino.login'].create({
            'company_id': self.id,
            'invoice_ids': invoices.ids if invoices else [],
            'step_name': 'login',
        })
        return wizard._run_step('login') or wizard._action_reopen()
