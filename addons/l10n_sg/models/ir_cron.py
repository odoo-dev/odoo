from odoo import models


class IrCron(models.Model):
    _inherit = 'ir.cron'

    _account_peppol__ir_cron_peppol_auto_register_services = models.Ref('account_peppol.ir_cron_peppol_auto_register_services', 'ir.cron', required=False)
