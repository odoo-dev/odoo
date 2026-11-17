from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = "pos.config"

    l10n_es_edi_verifactu_required = fields.Boolean(
        string="Veri*Factu Required",
        compute="_compute_l10n_es_edi_verifactu_required",
    )

    def _compute_l10n_es_edi_verifactu_required(self):
        for config in self:
            config.l10n_es_edi_verifactu_required = config.company_id._l10n_es_pos_get_fiscal_mode() == 'verifactu'

    @api.model
    def _load_pos_data_read(self, records, config):
        data = super()._load_pos_data_read(records, config)

        if data and config.l10n_es_edi_verifactu_required:
            verifactu_invoice_type_field = self.env['ir.model.fields']._get('pos.order', 'l10n_es_invoice_type')
            data[0]['_verifactu_invoice_types'] = [
                {'value': invoice_type.value, 'name': invoice_type.name}
                for invoice_type in verifactu_invoice_type_field.selection_ids
            ]

        return data
