# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import report
from . import wizard

from odoo import Command


def _enable_tracking_numbers(env):
    """ This hook ensures the tracking numbers are enabled when the module is installed since the
    user can install `product_expiry` manually without enable `group_production_lot`.
    """
    groups = env['res.groups']._base__group_user + env['res.groups']._base__group_portal
    groups.write({'implied_ids': [Command.link(env['res.groups']._stock__group_production_lot.id)]})
