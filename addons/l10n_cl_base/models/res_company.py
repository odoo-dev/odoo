# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class ResCompany(models.Model):
    _name = 'res.company'
    _inherit = 'res.company'

    l10n_cl_identification_type_id = fields.Many2one(
        related='partner_id.l10n_cl_identification_type_id',
        readonly=False,
    )
    l10n_cl_rut = fields.Char(
        related='partner_id.l10n_cl_rut',
    )
    l10n_cl_rut_dv = fields.Char(
        related='partner_id.l10n_cl_rut_dv',
    )
    
    @api.multi
    def validate_rut(self):
        return self.partner_id.validate_rut()
