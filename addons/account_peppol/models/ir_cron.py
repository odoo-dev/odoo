from odoo import models


class IrCron(models.Model):
    _inherit = 'ir.cron'

    _account_peppol__ir_cron_peppol_get_message_status_optional = models.Ref('account_peppol.ir_cron_peppol_get_message_status', 'ir.cron', required=False)
    _account_peppol__ir_cron_peppol_get_new_documents_optional = models.Ref('account_peppol.ir_cron_peppol_get_new_documents', 'ir.cron', required=False)
    _account_peppol__ir_cron_peppol_get_participant_status_optional = models.Ref(
        'account_peppol.ir_cron_peppol_get_participant_status', 'ir.cron', required=False)
