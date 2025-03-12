from odoo import api, models


class Partner(models.Model):
    _inherit = 'res.partner'

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        if self.env.company.country_id.code == 'EG':
            params += ['l10n_eg_building_no']
        return params
