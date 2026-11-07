# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import wizard


def uninstall_hook(env):
    if rule := env['ir.access']._gamification__gamification_badge_user_access:
        rule.active = True
