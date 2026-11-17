# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def _load_pos_data_read(self, records, config):
        # EXTENDS 'point_of_sale'
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            fiscal_mode = config.company_id._l10n_es_pos_get_fiscal_mode()
            # The JS patches of the EDI modules check this mode instead of their own flags.
            read_records[0]['_l10n_es_pos_fiscal_mode'] = fiscal_mode
            if fiscal_mode:
                # Full list: each EDI module filters it in its own refund popup if needed.
                read_records[0]['_l10n_es_refund_reasons'] = self.env['pos.order']._l10n_es_pos_get_refund_reasons()
        return read_records