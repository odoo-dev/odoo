# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import _, api, models


class ProductProduct(models.Model):
    _name = 'product.product'
    _inherit = ['product.product', 'pos.load.mixin']

    @api.model
    def create(self, vals_list):
        new_product = super().create(vals_list)
        pos_session_id = self.env.context.get('pos_session_id')
        if pos_session_id and new_product.product_tmpl_id.pos_categ_ids:
            session = self.env['pos.session'].browse(pos_session_id)
            config = session.config_id

            # Check if any of the categories is already in the pos
            if config.iface_available_categ_ids and not set(config.iface_available_categ_ids).intersection(new_product.product_tmpl_id.pos_categ_ids):
                # Add the first chosen category to the POS by default
                category = new_product.product_tmpl_id.pos_categ_ids[0]
                if category not in config.iface_available_categ_ids:
                    config.link_category_form_pos(category)

        return new_product

    @api.model
    def _load_pos_data_domain(self, data, config):
        return [('product_tmpl_id', 'in', [p['id'] for p in data['product.template']])]

    @api.model
    def _load_pos_data_fields(self, config):
        taxes = self.env['account.tax'].search(self.env['account.tax']._check_company_domain(config.company_id.id))
        product_fields = taxes._eval_taxes_computation_prepare_product_fields()
        # 'product_tag_ids' is deliberately absent: nothing reads the tags of a variant.
        # The two places that display tags (pos_self_order) read them off the template,
        # and pos_hr / pos_loyalty use the distinct 'all_product_tag_ids'. pos_loyalty
        # adds the field back on its own when a reward domain filters on it.
        fields = product_fields.union({
            'id', 'lst_price', 'display_name', 'product_tmpl_id', 'product_template_variant_value_ids',
            'product_template_attribute_value_ids', 'barcode', 'default_code', 'standard_price'
        })
        # See product.template._load_pos_data_fields: these are only needed to convert the
        # prices server-side, and no conversion is possible when the PoS runs in the
        # currency of the company the products belong to.
        if config.currency_id != config.company_id.currency_id:
            fields |= {'currency_id', 'cost_currency_id'}
        return list(fields)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_active_pos_session_or_special_product(self):
        self.product_tmpl_id._check_is_special_product()
        self.product_tmpl_id._ensure_unused_in_pos()

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        self._convert_pos_data_currency(read_records, config, 'lst_price', 'currency_id')
        self._convert_pos_data_currency(read_records, config, 'standard_price', 'cost_currency_id')
        return read_records

    def _can_return_content(self, field_name=None, access_token=None):
        if field_name == "image_128" and self.sudo().available_in_pos:
            return True
        return super()._can_return_content(field_name, access_token)

    def action_archive(self):
        self.product_tmpl_id._check_is_special_product()
        self.product_tmpl_id._ensure_unused_in_pos()
        return super().action_archive()

    def _build_duplicate_barcode_error_string(self, barcode, duplicate_products):
        if not self.env.context.get("is_pos_product_action"):
            return super()._build_duplicate_barcode_error_string(barcode, duplicate_products)

        return _(
            "Barcode \"%(barcode)s\" already assigned to \"%(product_list)s\"",
            barcode=barcode,
            product_list=(duplicate_products - self).mapped('display_name'),
        )

    def _build_duplicate_barcode_error_note(self):
        if not self.env.context.get("is_pos_product_action"):
            return super()._build_duplicate_barcode_error_note()
        return ""
