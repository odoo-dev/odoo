# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import controllers

def uninstall_hook(env):
    if env['gamification.goal.definition']._website_slides__badge_data_certification_goal:
        env['gamification.goal.definition']._website_slides__badge_data_certification_goal.domain = "[('completed', '=', True), (0, '=', 1)]"
