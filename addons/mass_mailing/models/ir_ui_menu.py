from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    _mass_mailing__menu_mass_mailing_global_settings = models.Ref('mass_mailing.menu_mass_mailing_global_settings', 'ir.ui.menu')
