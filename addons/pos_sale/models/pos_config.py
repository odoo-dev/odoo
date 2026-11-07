# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, Command


class PosConfig(models.Model):
    _inherit = 'pos.config'

    _pos_sale__default_downpayment_product = models.Ref('pos_sale.default_downpayment_product', 'product.product', required=False)
    _pos_sale__default_sol_product = models.Ref('pos_sale.default_sol_product', 'product.product', required=False)
    _product__product_category_services = models.Ref('product.product_category_services', 'product.category', required=False)
    _uom__product_uom_unit_optional = models.Ref('uom.product_uom_unit', 'uom.uom', required=False)

    def _get_default_down_payment_product(self):
        return self._pos_sale__default_downpayment_product

    def _get_default_sol_product(self):
        return self._pos_sale__default_sol_product

    crm_team_id = fields.Many2one(
        'crm.team', string="Sales Team", ondelete="set null", index='btree_not_null',
        help="This Point of sale's sales will be related to this Sales Team.")
    down_payment_product_id = fields.Many2one('product.product',
        required=True,
        string="Down Payment Product",
        init_storage='_init_column_default_products',
        default=_get_default_down_payment_product,
        help="This product will be used as down payment on a sale order.")
    default_product_id = fields.Many2one(
        'product.product',
        required=True,
        string="Default Product",
        init_storage='_init_column_default_products',
        default=_get_default_sol_product,
        help="This product will be used as default product on productless SOLs."
    )

    def _get_special_products(self):
        res = super()._get_special_products()
        return res | self.env['pos.config'].search([]).mapped(
            lambda config: config.down_payment_product_id | config.default_product_id
        )

    def _init_column_default_products(self):
        category_id = self._product__product_category_services.id
        uom_unit_id = self._uom__product_uom_unit_optional.id

        to_create = []
        xmlids_needed = []

        if not self._get_default_down_payment_product():
            to_create.append({
                'name': 'Down Payment (POS)',
                'available_in_pos': False,
                'list_price': 0.00,
                'type': 'service',
                'taxes_id': [Command.clear()],
                'categ_id': category_id,
                'uom_id': uom_unit_id,
                'purchase_ok': False,
            })
            xmlids_needed.append('default_downpayment_product')

        if not self._pos_sale__default_sol_product:
            to_create.append({
                'name': 'Default Product (POS)',
                'available_in_pos': False,
                'list_price': 0.00,
                'type': 'service',
                'taxes_id': [Command.clear()],
                'categ_id': category_id,
                'uom_id': uom_unit_id,
                'purchase_ok': False,
            })
            xmlids_needed.append('default_sol_product')

        if not to_create:
            return

        products = self.env['product.product'].sudo().create(to_create)

        self.env['ir.model.data'].sudo()._update_xmlids([
            {'xml_id': f'pos_sale.{xml_id}', 'record': product, 'noupdate': True}
            for xml_id, product in zip(xmlids_needed, products)
        ])
