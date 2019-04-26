# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class ResCompany(models.Model):

    _inherit = 'res.company'

    l10n_ar_id_category_id = fields.Many2one(
        related='partner_id.l10n_ar_id_category_id',
    )
    l10n_ar_id_number = fields.Char(
        related='partner_id.l10n_ar_id_number',
    )
    l10n_ar_cuit = fields.Char(
        related='partner_id.l10n_ar_cuit'
    )

    @api.multi
    def cuit_required(self):
        return self.partner_id.cuit_required()
