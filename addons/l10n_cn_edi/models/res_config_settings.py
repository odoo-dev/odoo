# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_cn_edi_drawer = fields.Char(related='company_id.l10n_cn_edi_drawer', readonly=False)
    l10n_cn_edi_is_ready = fields.Boolean(compute='_compute_l10n_cn_edi_is_ready')

    @api.depends('company_id')
    def _compute_l10n_cn_edi_is_ready(self):
        for settings in self:
            settings.l10n_cn_edi_is_ready = settings.company_id._l10n_cn_edi_is_ready()
