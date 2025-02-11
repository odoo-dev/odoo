# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_res_partner(self):
        # OVERRIDE to load the MY EDI fields when loading the pos data
        vals = super()._loader_params_res_partner()
        if self.company_id.country_code == 'MY':
            vals['search_params']['fields'] += ['l10n_my_identification_type', 'l10n_my_identification_number', 'l10n_my_edi_industrial_classification', 'l10n_my_edi_malaysian_tin']
        return vals

    def _pos_data_process(self, loaded_data):
        # OVERRIDE to load the possible values for the two selection fields.
        super()._pos_data_process(loaded_data)
        if self.company_id.country_code == 'MY':
            l10n_my_identification_type = self.env['ir.model.fields']._get('res.partner', 'l10n_my_identification_type')
            loaded_data['l10n_my_identification_type'] = [{'value': s.value, 'name': s.name} for s in l10n_my_identification_type.selection_ids]
