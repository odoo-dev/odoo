# -*- coding: utf-8 -*-
from odoo import models, api
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    _l10n_ar_pos_consumidor_final = models.Ref('l10n_ar.par_cfa', message=_lt('Deleting this partner is not allowed.'))
    _l10n_ar__par_cfa = models.Ref('l10n_ar.par_cfa')

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        if self.env.company.country_id.code == 'AR':
            params += ['l10n_ar_afip_responsibility_type_id']
        return params
