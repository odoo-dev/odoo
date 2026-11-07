from odoo import models, api


class PosConfig(models.Model):
    _inherit = 'pos.config'

    _l10n_ar__par_cfa = models.Ref('l10n_ar.par_cfa', 'res.partner')

    def get_limited_partners_loading(self, offset=0):
        partner_ids = super().get_limited_partners_loading(offset)
        if (self._l10n_ar__par_cfa.id,) not in partner_ids:
            partner_ids.append((self._l10n_ar__par_cfa.id,))
        return partner_ids

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        if read_records and self.env.company.country_id.code == 'AR':
            read_records[0]['_consumidor_final_anonimo_id'] = self._l10n_ar__par_cfa.id
        return read_records
