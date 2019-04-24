from odoo import models, fields, api


class ResCountry(models.Model):

    _inherit = 'res.country'

    l10n_ar_cuit_fisica = fields.Char(
        'CUIT persona fisica',
        size=11,
    )
    l10n_ar_cuit_juridica = fields.Char(
        'CUIT persona juridica',
        size=11,
    )
    cuit_otro = fields.Char(
        'CUIT otro',
        size=11,
    )
