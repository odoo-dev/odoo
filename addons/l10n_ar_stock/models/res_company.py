import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_ar_arba_cit = fields.Char(
        string="CIT",
        groups='stock.group_stock_manager',
        help="Argentina: CIT (Clave de Identificación Tributaria) provided by ARBA, used as password of the COT web service.",
    )
    l10n_ar_arba_cot_environment = fields.Selection(
        selection=[
            ('demo', "Demo"),
            ('testing', "Testing"),
            ('production', "Production"),
        ],
        string="ARBA COT Environment",
        default='demo',
        help="Argentina: The Demo environment does not send anything to ARBA and is only meant to test the workflow.",
    )

    @api.constrains('l10n_ar_arba_cit')
    def _check_l10n_ar_arba_cit(self):
        for company in self.sudo():
            cit = company.l10n_ar_arba_cit
            if cit and not (
                9 <= len(cit) <= 30
                and re.search(r'[A-Z]', cit)
                and re.search(r'[a-z]', cit)
                and re.search(r'[0-9]', cit)
            ):
                raise ValidationError(self.env._(
                    "The CIT must contain between 9 and 30 characters, including at least one number,"
                    " one uppercase letter and one lowercase letter.",
                ))
