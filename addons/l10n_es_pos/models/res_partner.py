from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    _l10n_es__partner_simplified = models.Ref('l10n_es.partner_simplified')
