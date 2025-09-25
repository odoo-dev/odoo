from odoo import models, api


class ResCurrency(models.Model):
    _name = 'res.currency'
    _inherit = ['res.currency', 'pos.load.mixin']

    @api.model
    def _load_pos_data_domain(self, data, config):
        company_currency_id = config.company_id.currency_id.id
        config_currency_id = config.currency_id.id
        journal_currency_ids = config.payment_method_ids.journal_id.currency_id.ids
        
        currency_ids = set(journal_currency_ids)
        currency_ids.add(company_currency_id)
        currency_ids.add(config_currency_id)

        return [('id', 'in', list(currency_ids))]

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'symbol', 'position', 'rounding', 'rate', 'inverse_rate', 'decimal_places', 'iso_numeric']
