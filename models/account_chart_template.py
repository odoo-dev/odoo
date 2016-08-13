# -*- coding: utf-8 -*-
##############################################################################
# For copyright and license notices, see __openerp__.py file in module root
# directory
##############################################################################
from openerp import models, api, fields
import logging
_logger = logging.getLogger(__name__)


class AccountChartTemplate(models.Model):
    _inherit = 'account.chart.template'

    _get_localizations = (
        lambda self, *args, **kwargs: self.env[
            'res.company']._get_localizations(*args, **kwargs))

    localization = fields.Selection(
        _get_localizations,
        'Localization',
        help='If you set the localization here, then when installing '
        'this chart, this localization will be set on company'
    )

    @api.multi
    def _load_template(
            self, company, code_digits=None, transfer_account_id=None,
            account_ref=None, taxes_ref=None):
        self.ensure_one()
        """
        Set localization to company when installing chart of account.
        """
        if not company.localization:
            company.localization = self.localization
        return super(AccountChartTemplate, self)._load_template(
            company, code_digits, transfer_account_id,
            account_ref, taxes_ref)

    @api.model
    def _prepare_all_journals(
            self, acc_template_ref, company, journals_dict=None):
        """
        We add use_documents or not depending on the context
        """
        journal_data = super(
            AccountChartTemplate, self)._prepare_all_journals(
            acc_template_ref, company, journals_dict)

        # if chart has localization, then we use documents by default
        if self.localization:
            for vals_journal in journal_data:
                if vals_journal['type'] == 'sale':
                    vals_journal['use_documents'] = self._context.get(
                        'sale_use_documents', True)
                if vals_journal['type'] == 'purchase':
                    vals_journal['use_documents'] = self._context.get(
                        'purchase_use_documents', True)
        return journal_data
