# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_kr_edi_staging_mode = fields.Boolean(related='company_id.l10n_kr_edi_staging_mode', readonly=False)
    l10n_kr_edi_barobill_id = fields.Char(related='company_id.l10n_kr_edi_barobill_id', readonly=False)
    l10n_kr_edi_certificate_key = fields.Char(related='company_id.l10n_kr_edi_certificate_key', readonly=False)
