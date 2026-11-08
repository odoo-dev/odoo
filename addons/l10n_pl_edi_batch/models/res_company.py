from datetime import timedelta

from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_pl_edi_batch_enabled = fields.Boolean("KSeF batch download")
    l10n_pl_edi_batch_historic_date = fields.Datetime(
        "KSeF historic download date",
        default=lambda self: fields.Datetime.start_of(fields.Datetime.now(), 'day') - timedelta(days=1),
    )

    def write(self, vals):
        """ If we are enabling the first batch company, set the historic date on the company and activate the crons """
        res = super().write(vals)
        if 'l10n_pl_edi_batch_enabled' in vals:
            if vals['l10n_pl_edi_batch_enabled']:
                self.l10n_pl_edi_batch_historic_date = fields.Datetime.start_of(fields.Datetime.now(), 'day') - timedelta(days=1)
            any_enabled = self.sudo().search_count([('l10n_pl_edi_batch_enabled', '=', True)], limit=1)
            for cron_xmlid in (
                'l10n_pl_edi_batch.ir_cron_request_historic',
                'l10n_pl_edi_batch.ir_cron_check_status',
                'l10n_pl_edi_batch.ir_cron_download',
                'l10n_pl_edi_batch.ir_cron_import',
            ):
                self.env.ref(cron_xmlid).sudo().active = any_enabled
        return res
