# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models
from . import wizard
from . import report


def uninstall_hook(env):
    # put the rules back to their original domain (TRUE)
    if rule := env['ir.access']._base__res_partner_bank_rule_user:
        rule.active = True
    if rule := env['ir.access']._base__res_partner_bank_rule_user_1:
        rule.active = True
