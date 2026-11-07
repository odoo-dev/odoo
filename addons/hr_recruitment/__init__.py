# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import wizard


def uninstall_hook(env):
    env['ir.access'].ref('hr.access_hr_job_user').active = True
