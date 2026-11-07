# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import wizard


def uninstall_hook(env):
    env['ir.access'].ref('gamification.gamification_badge_user_access').active = True
