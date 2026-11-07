from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    _l10n_tw_edi_ecpay_pos__ecpay_default_walk_in_customer = models.Ref('l10n_tw_edi_ecpay_pos.ecpay_default_walk_in_customer', required=False)
