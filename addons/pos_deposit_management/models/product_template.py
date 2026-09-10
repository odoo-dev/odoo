from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    deposit_price = fields.Monetary("Deposit Price")

    @api.model
    def _load_pos_data_fields(self, config):
        params = super()._load_pos_data_fields(config)
        params.append('deposit_price')
        return params

    def _load_pos_metadata(self, data, search_params={}):
        super()._load_pos_metadata(data, search_params)
        config_id = data['pos.config']['records'][0]
        deposit_product_id = config_id.deposit_product_id.product_tmpl_id

        if config_id.module_pos_deposit_management:
            data['product.template']['records'] |= deposit_product_id._filtered_access('read')

        return data

    def _get_special_products_to_archive(self):
        return super()._get_special_products_to_archive() | self.env.ref("pos_deposit_management.product_product_consumable").product_tmpl_id
