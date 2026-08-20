# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.l10n_ge_edi.lib.rsge_client import RSgeClient, RSgeError


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_ge_edi_su = fields.Char(string="RS.ge Service User", groups='base.group_system')
    l10n_ge_edi_sp = fields.Char(string="RS.ge Service Password", groups='base.group_system')
    l10n_ge_edi_user_id = fields.Integer(
        string="RS.ge User Id",
        groups="base.group_system",
        readonly=True,
        compute="_compute_l10n_ge_edi_user_id",
        store=True,
    )

    l10n_ge_edi_last_fetched_date = fields.Datetime(
        string="Fetch Bills Registered After",
        # Defaulted so that an empty value only ever means "the credentials just changed".
        default=fields.Datetime.now,
        help="Vendor bills are fetched from RS.ge starting from this date. Reset whenever the "
        "RS.ge credentials change, since a different service user sees different documents.",
    )

    def write(self, vals):
        # EXTENDS 'base'
        if {"l10n_ge_edi_su", "l10n_ge_edi_sp"} & vals.keys():
            vals = {**vals, "l10n_ge_edi_last_fetched_date": False}
        return super().write(vals)

    @api.depends("l10n_ge_edi_su", "l10n_ge_edi_sp")
    def _compute_l10n_ge_edi_user_id(self):
        for company in self:
            if not company.l10n_ge_edi_su or not company.l10n_ge_edi_sp:
                company.l10n_ge_edi_user_id = False
                continue
            try:
                company.l10n_ge_edi_user_id = (
                    company._get_rsge_client().check_credentials()
                )
            except RSgeError:
                company.l10n_ge_edi_user_id = False

    @api.constrains('l10n_ge_edi_su')
    def _check_l10n_ge_edi_su(self):
        for company in self:
            if company.l10n_ge_edi_su and not re.match(r'^\S+:\d+$', company.l10n_ge_edi_su):
                raise ValidationError(self.env._(
                    'The RS.ge Service User must be in the "username:number" format shown on '
                    'the RS.ge sub-user page.'
                ))

    def _get_rsge_client(self):
        """ Return an :class:`RSgeClient` configured with this company's RS.ge credentials. """
        self.ensure_one()
        company = self.sudo()
        return RSgeClient(su=company.l10n_ge_edi_su, sp=company.l10n_ge_edi_sp)
