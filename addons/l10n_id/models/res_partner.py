# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.addons.l10n_id.models.account_move import TAX_TRANSACTION_CODE


class Partner(models.Model):
    _inherit = "res.partner"

    l10n_id_kode_transaksi = fields.Selection(
        selection=TAX_TRANSACTION_CODE,
        string='Invoice Transaction Code',
        help="The first 2 digits of tax code",
        default='04',
        tracking=True,
    )
