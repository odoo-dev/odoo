# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class StockPutInPack(models.TransientModel):
    _inherit = 'stock.put.in.pack'

    weight_uom_name = fields.Char(string='Weight unit of measure label', compute='_compute_weight_uom_name')
    package_carrier_type = fields.Char('Carrier Type')

    def _compute_weight_uom_name(self):
        self.weight_uom_name = self.env['product.template']._get_weight_uom_id_from_ir_config_parameter().name

    def _get_packages_weight(self):
        if not self.package_carrier_type:
            return super()._get_packages_weight()
        weight = sum(package.shipping_weight for package in self.package_ids)
        if result_package := self.result_package_id:
            # If we use an existing package, we need to factor in the shipping weight already set on the package.
            weight += (
                result_package.shipping_weight
                or result_package.package_type_id.base_weight
            )
        return weight

    def _get_put_in_pack_context(self):
        context = super()._get_put_in_pack_context()
        return {
            **context,
            'weight': self.shipping_weight,
        } if self.package_carrier_type else context
