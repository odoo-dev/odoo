from odoo import models


class IrCron(models.Model):
    _inherit = 'ir.cron'

    _l10n_dk__ir_cron_nemhandel_get_message_status_optional = models.Ref('l10n_dk.ir_cron_nemhandel_get_message_status', 'ir.cron', required=False)
    _l10n_dk__ir_cron_nemhandel_get_new_documents_optional = models.Ref('l10n_dk.ir_cron_nemhandel_get_new_documents', 'ir.cron', required=False)
    _l10n_dk__ir_cron_nemhandel_get_participant_status = models.Ref('l10n_dk.ir_cron_nemhandel_get_participant_status', 'ir.cron', required=False)
