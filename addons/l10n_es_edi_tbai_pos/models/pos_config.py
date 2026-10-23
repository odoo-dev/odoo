from odoo import models, api


class PosConfig(models.Model):
    _inherit = 'pos.config'

    @api.model
    def _load_pos_data_read(self, records, config):
        data = super()._load_pos_data_read(records, config)

        if data and self.env.company.country_id.code == 'ES':
            tbai_refund_reasons = self.env['pos.order'].fields_get(['l10n_es_invoice_type'])['l10n_es_invoice_type']['selection']
            data[0]['_tbai_refund_reasons'] = [
                {'value': value, 'name': name}
                for value, name in tbai_refund_reasons
                if value != 'R5'  # R5 is for simplified invoice
            ]

        return data
