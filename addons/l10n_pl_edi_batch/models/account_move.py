from odoo import api, models

from odoo.addons.l10n_pl_edi.tools.ksef_api_service import KsefApiService


class AccountMove(models.Model):
    _inherit = 'account.move'

    @api.model
    def _cron_l10n_pl_edi_download_bills(self):
        """ Per company: a today batch with the batch download enabled, the single-invoice download otherwise. """
        companies = self.env['res.company'].search([('l10n_pl_edi_access_token', '!=', False)])
        batch_companies = companies.filtered('l10n_pl_edi_batch_enabled')
        if batch_companies:
            self.env['l10n_pl_edi_batch.download']._cron_request_today()
        for company in companies - batch_companies:
            if self.with_company(company)._l10n_pl_edi_download_bills_from_ksef():
                break

    def action_l10n_pl_edi_import_from_ksef(self):
        """ With batches enabled, the crons download the new bills: the action only fills the bills the
            single-invoice download left half-fetched (fetch_ready, fetch_failed), one by one by KSeF number. """
        if not self.env.company.l10n_pl_edi_batch_enabled:
            return super().action_l10n_pl_edi_import_from_ksef()
        half_fetched_bills = self.search([
            ('l10n_pl_edi_number', '!=', False),
            ('move_type', '=', 'in_invoice'),
            ('l10n_pl_edi_status', 'in', ('fetch_ready', 'fetch_failed')),
            *self._check_company_domain(self.env.company),
        ])
        self._fetch_bills_data(KsefApiService(self.env.company), half_fetched_bills)
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }
