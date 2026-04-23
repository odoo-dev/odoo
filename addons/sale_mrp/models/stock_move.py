# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _get_kit_value_per_unit(self):
        order_line = self.sale_line_id
        if order_line and all(move.sale_line_id == order_line for move in self) and any(move.product_id != order_line.product_id for move in self):
            product = order_line.product_id.with_company(order_line.company_id)
            bom = product.env['mrp.bom']._bom_find(product, company_id=self.company_id.id, bom_type='phantom')[product]
            if bom:
                return self._get_kit_price_unit(product, bom, order_line.product_uom_qty)

    def _get_price_unit(self):
        kit_unit_price = self._get_kit_value_per_unit()
        if kit_unit_price:
            return kit_unit_price
        return super()._get_price_unit()

    def _get_price_unit_dropshipped(self):
        """ Overridden to handle Kit dropship products correctly. """
        kit_unit_price = self._get_kit_value_per_unit()
        if kit_unit_price:
            return kit_unit_price
        return super()._get_price_unit_dropshipped()

    def _get_source_document(self):
        return self.production_id or self.raw_material_production_id or super()._get_source_document()
