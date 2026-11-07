# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    _sale_management__sale_order_template_view_form_mandatory_product = models.Ref(
        'sale_management.sale_order_template_view_form_mandatory_product', 'ir.ui.view', required=False)

    def set_values(self):
        super().set_values()
        self._sale_management__sale_order_template_view_form_mandatory_product.active = self.sale_order_mandatory_product
