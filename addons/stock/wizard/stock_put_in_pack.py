# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class StockPutInPack(models.TransientModel):
    _name = 'stock.put.in.pack'
    _description = 'Put In Pack Wizard'

    location_dest_id = fields.Many2one('stock.location', 'Destination')
    move_line_ids = fields.Many2many('stock.move.line', string='Move lines')
    package_ids = fields.Many2many('stock.package', string='Packages')
    package_type_id = fields.Many2one('stock.package.type', 'Package Type')
    package_type_sequence_id = fields.Many2one(related="package_type_id.sequence_id")
    result_package_id = fields.Many2one('stock.package', 'Package')
    origin_package_ids = fields.Many2many('stock.package', compute='_compute_origin_package_ids')
    shipping_weight = fields.Float('Shipping Weight', compute='_compute_shipping_weight', store=True, readonly=False)
    weight_uom_name = fields.Char(string='Weight unit of measure label', compute='_compute_weight_uom_name')

    def _compute_weight_uom_name(self):
        self.weight_uom_name = self.env['product.template']._get_weight_uom_id_from_ir_config_parameter().name

    def _compute_origin_package_ids(self):
        for wizard in self:
            packages = wizard.package_ids
            if wizard.move_line_ids:
                packages |= wizard.move_line_ids.result_package_id
            wizard.origin_package_ids = packages.parent_package_id

    @api.depends('package_type_id', 'result_package_id')
    def _compute_shipping_weight(self):
        for wizard in self:
            # Add package weights to shipping weight, package base weight is defined in package.type
            total_weight = wizard.package_type_id.base_weight or wizard.result_package_id.package_type_id.base_weight or 0.0

            if wizard.result_package_id:
                # If we use an existing package, we need to factor in the shipping weight already set on the package.
                total_weight += wizard.result_package_id.shipping_weight

            for ml in wizard.move_line_ids:
                qty = ml.uom_id._compute_quantity(ml.quantity, ml.product_id.uom_id)
                total_weight += qty * ml.product_id.weight
            for package in wizard.package_ids:
                total_weight += package.shipping_weight

            wizard.shipping_weight = total_weight

    @api.onchange('package_type_id', 'result_package_id', 'shipping_weight')
    def _onchange_package_type_weight(self):
        max_weight = self.package_type_id.max_weight if self.package_type_id else self.result_package_id.package_type_id.max_weight
        if max_weight and self.shipping_weight > max_weight:
            if self.package_type_id:
                message = self.env._('The weight of your package is higher than the maximum weight authorized for this package type. Please choose another package type.')
            else:
                message = self.env._('The weight of your package is higher than the maximum weight authorized for its package type. Please choose another package.')
            return {
                'warning': {
                    'title': self.env._('Package too heavy!'),
                    'message': message,
                }
            }

    @api.onchange('package_type_id')
    def _onchange_package_type_id(self):
        if self.package_type_id and self.result_package_id and self.result_package_id.package_type_id != self.package_type_id:
            self.result_package_id = False

    def action_put_in_pack(self):
        context = self._get_put_in_pack_context()
        if self.package_ids:
            return self.package_ids.with_context(**context).action_put_in_pack(package_id=self.result_package_id.id, package_type_id=self.package_type_id.id)
        return self.move_line_ids.with_context(**context).action_put_in_pack(package_id=self.result_package_id.id, package_type_id=self.package_type_id.id)

    def _get_put_in_pack_context(self):
        return {
            **self.env.context,
            'from_package_wizard': True,
            'weight': self.shipping_weight,
        }
