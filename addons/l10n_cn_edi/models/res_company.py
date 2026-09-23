# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models
from odoo.exceptions import UserError


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_cn_edi_drawer = fields.Char(
        string="Drawer (开票人)",
        help="Name printed as the drawer (开票人) on issued e-Fapiao. "
             "Defaults to the current user when left empty.",
    )

    def _l10n_cn_edi_get_client(self):
        """Return the provider's client for this company (an ``L10nCnEdiClient``).

        Overridden by the provider module; the installed provider is the provider.
        """
        self.ensure_one()
        raise UserError(self.env._("No e-Fapiao provider is installed. Install one to issue e-Fapiao."))

    def _l10n_cn_edi_is_ready(self):
        """Whether this company is configured to issue e-Fapiao. Overridden by the provider module."""
        self.ensure_one()
        return False
