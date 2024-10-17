# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import report
from . import wizard

from .models.account_invoice import AccountMove
from .models.account_journal import AccountJournal
from .models.account_payment import AccountPayment
from .models.ir_actions_report import IrActionsReport
from .models.res_bank import ResPartnerBank
from .models.template_ch import AccountChartTemplate
from .report.swissqr_report import ReportL10n_ChQr_Report_Main
from .wizard.qr_invoice_wizard import L10n_ChQr_InvoiceWizard
from .wizard.setup_wizards import AccountSetupBankManualConfig


def init_settings(env):
    '''If the company is localized in Switzerland, activate the cash rounding by default.
    '''
    # The cash rounding is activated by default only if the company is localized in Switzerland or Liechtenstein.
    for company in env['res.company'].search([('partner_id.country_id.code', 'in', ["CH", "LI"])]):
        config_wizard = env['res.config.settings'].create({
            'company_id': company.id,
            'group_cash_rounding': True
        })
        # We need to call execute, otherwise the "implied_group" in fields are not processed.
        config_wizard.execute()
        config_wizard.unlink()

def post_init(env):
    init_settings(env)
