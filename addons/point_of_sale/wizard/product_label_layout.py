from odoo import fields, models
from odoo.tools import format_amount

EPSON_FORMAT_SIZE = {
    'normal': (2.25, 1.25),
    'small': (1.25, 1.00),
    'alternative': (2.00, 1.00),
    'jewelry': (2.20, 0.50),
}


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    print_format = fields.Selection(selection_add=[
        ('epson', 'EPSON Labels'),
    ], ondelete={'epson': 'set default'})
    epson_template = fields.Selection([
        ('normal', 'Normal (2.25" x 1.25")'),
        ('small', 'Small (1.25" x 1.00")'),
        ('alternative', 'Alternative (2.00" x 1.00")'),
        ('jewelry', 'Jewelry (2.20" x 0.50")'),
    ], string="Epson Template", default='normal', required=True)

    def _get_product_data(self):
        if self.product_ids:
            products = self.product_ids
        elif self.product_tmpl_ids:
            products = self.product_tmpl_ids
        return {
            'products': [{
                'name': product.name,
                'barcode': product.barcode,
                'price': format_amount(self.env, (product.list_price if self.env.context.get('active_model') == 'product.template' else product.lst_price) if not self.pricelist_id else self.pricelist_id._get_product_price(product, 1.0, uom=product.uom_id), self.env.company.currency_id),
            } for product in products]
        }

    def process(self):
        if self.print_format == 'epson':
            return {
                'type': 'ir.actions.client',
                'tag': 'pos_printer_action',
                'params': {
                    'quantity': self.custom_quantity,
                    'epson_template': self.epson_template,
                    'products': self._get_product_data().get('products'),
                    'next': {'type': 'ir.actions.act_window_close'}
                },
            }
        return super().process()
