# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models

from .models.res_company import ResCompany
from .models.res_config_settings import ResConfigSettings

def l10n_eu_oss_uninstall(env):
    env.cr.execute("DELETE FROM ir_model_data WHERE module = 'l10n_eu_oss' and model in ('account.tax.group', 'account.account');")
