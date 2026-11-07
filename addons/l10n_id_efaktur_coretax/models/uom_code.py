# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

class EfakturUomCode(models.Model):
    _name = "l10n_id_efaktur_coretax.uom.code"
    _description = "UOM categorization according to E-Faktur"

    _l10n_id_efaktur_coretax__uom_code_0018 = models.Ref('l10n_id_efaktur_coretax.uom_code_0018')

    code = fields.Char()
    name = fields.Char()

    @api.depends('name', 'code')
    def _compute_display_name(self):
        for record in self:
            record.display_name = f"{record.name} ({record.code})"
