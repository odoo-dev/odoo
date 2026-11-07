from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _account_payment__payment_provider_menu_optional = models.Ref('account_payment.payment_provider_menu', required=False)
