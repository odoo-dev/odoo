from odoo import models


class EfakturDocument(models.Model):
    _inherit = "l10n_id_efaktur_coretax.document"

    def l10n_id_pajakio_generate_invoices(self):
        self.invoice_ids.l10n_id_pajakio_generate()

    def l10n_id_pajakio_upload_invoices(self):
        self.invoice_ids.l10n_id_pajakio_upload()

    def l10n_id_pajakio_check_status(self):
        self.invoice_ids.l10n_id_pajakio_update_status()
