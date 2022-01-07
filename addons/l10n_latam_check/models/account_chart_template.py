from odoo import models, _
import logging
_logger = logging.getLogger(__name__)
THIRD_CHECKS_COUNTRY_CODES = ["AR"]


class AccountChartTemplate(models.Model):
    _inherit = 'account.chart.template'

    def _create_bank_journals(self, company, acc_template_ref):
        res = super(AccountChartTemplate, self)._create_bank_journals(company, acc_template_ref)

        if company.country_id.code in THIRD_CHECKS_COUNTRY_CODES:
            self.env['account.journal'].create({
                'name': _('Third Checks'),
                'type': 'cash',
                'company_id': company.id,
                'outbound_payment_method_line_ids':[(6, 0, [self.env.ref('l10n_latam_check.account_payment_method_out_third_checks').id])],
                'inbound_payment_method_line_ids': [(6, 0, [self.env.ref('l10n_latam_check.account_payment_method_new_third_checks').id,
                  self.env.ref('l10n_latam_check.account_payment_method_in_third_checks').id])],
            })
            self.env['account.journal'].create({
                'name': _('Rejected Third Checks'),
                'type': 'cash',
                'company_id': company.id,
                'outbound_payment_method_line_ids': [(6, 0, [self.env.ref('l10n_latam_check.account_payment_method_out_third_checks').id])],
            })

        return res
