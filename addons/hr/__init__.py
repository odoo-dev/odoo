# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models
from . import wizard
from . import report


def uninstall_hook(env):
    # put the rules back to their original domain (TRUE)
    env.ref('base.res_partner_bank_rule_user').domain_force = False
    env.ref('base.res_partner_bank_rule_partner_manager').domain_force = False
