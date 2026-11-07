# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import demo
from . import wizard

def init_settings(env):
    # Activate cash rounding by default for all companies as soon as the module is installed.
    group_user = env['res.groups']._base__group_user.sudo()
    group_user._apply_group(env['res.groups']._account__group_cash_rounding)

def post_init(env):
    init_settings(env)
