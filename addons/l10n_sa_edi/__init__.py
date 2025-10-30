# -*- coding: utf-8 -*-
from . import models, wizard


def _l10n_sa_edi_post_init(env):
    _l10n_sa_load_new_csv_data(env)


def _l10n_sa_load_new_csv_data(env):

    for company in env['res.company'].search([('chart_template', '=', 'sa'), ('parent_id', '=', False)]):
        Template = env['account.chart.template'].with_company(company)
        data = {
            "account.tax": Template._get_sa_edi_account_tax(),
        }
        Template._pre_reload_data(company, {}, data)
        Template._load_data(data)
        Template._load_translations(companies=company)
