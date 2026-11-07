from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _point_of_sale__menu_pos_preparation_printer_optional = models.Ref('point_of_sale.menu_pos_preparation_printer', required=False)
