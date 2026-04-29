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

    def _compute_origin_package_ids(self):
        for wizard in self:
            packages = wizard.package_ids
            if wizard.move_line_ids:
                packages |= wizard.move_line_ids.result_package_id
            wizard.origin_package_ids = packages.parent_package_id

    @api.onchange('package_type_id')
    def _onchange_package_type_id(self):
        if self.package_type_id and self.result_package_id and self.result_package_id.package_type_id != self.package_type_id:
            self.result_package_id = False

    def action_put_in_pack(self):
        context = self._get_put_in_pack_context()

        records = self.package_ids or self.move_line_ids
        package_id = self.result_package_id.id
        package_type_id = self.package_type_id.id

        # weight warning check
        if self.package_ids:
            action = records._get_put_in_pack_weight_warning_action(self.package_type_id, self.result_package_id)
        else:
            action = records._get_put_in_pack_weight_warning_action(self.package_type_id, self.result_package_id)

        if action:
            return action

        return records.with_context(**context).action_put_in_pack(
            package_id=package_id,
            package_type_id=package_type_id,
        )

    def _get_put_in_pack_context(self):
        return {
            **self.env.context,
            'from_package_wizard': True,
        }


class StockPutInPackWeightWarning(models.TransientModel):
    _name = 'stock.put.in.pack.weight.warning'
    _description = 'Put in Pack Weight Warning'

    move_line_ids = fields.Many2many('stock.move.line', string='Move lines', readonly=True)
    package_ids = fields.Many2many('stock.package', string='Packages', readonly=True)
    package_id = fields.Many2one('stock.package', string='Package', readonly=True)
    package_type_id = fields.Many2one('stock.package.type', string='Package Type', readonly=True)
    package_name = fields.Char('Package Name', readonly=True)
    description = fields.Text('Description', compute='_compute_description', readonly=True)

    @api.depends('package_type_id', 'package_id')
    def _compute_description(self):
        for wizard in self:
            package_type_name = wizard.package_type_id.name or (wizard.package_id.package_type_id.name if wizard.package_id and wizard.package_id.package_type_id else '')
            if wizard.move_line_ids:
                wizard.description = self.env._(
                    "The total weight of the products exceeds the maximum weight allowed for the selected package type %(package_type)s.\n"
                    "Do you want to continue adding the products to this package?",
                    package_type=package_type_name,
                )
            elif wizard.package_ids:
                wizard.description = self.env._(
                    "The total weight of the packages exceeds the maximum weight allowed for the selected package type %(package_type)s.\n"
                    "Do you want to continue adding the packages to this package?",
                    package_type=package_type_name,
                )
            else:
                wizard.description = self.env._(
                    "The total weight exceeds the maximum weight allowed for the selected package type %(package_type)s.\n"
                    "Do you want to continue?",
                    package_type=package_type_name,
                )

    def process(self):
        context = dict(self.env.context, skip_put_in_pack_weight_warning=True)
        if self.move_line_ids:
            return self.move_line_ids.with_context(**context).action_put_in_pack(
                package_id=self.package_id.id,
                package_type_id=self.package_type_id.id,
                package_name=self.package_name,
            )
        return self.package_ids.with_context(**context).action_put_in_pack(
            package_id=self.package_id.id,
            package_type_id=self.package_type_id.id,
            package_name=self.package_name,
        )

    def process_cancel(self):
        return {'type': 'ir.actions.act_window_close'}
