# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import wizard


def uninstall_hook(env):
    if access := env['ir.access']._hr__access_hr_job_user:
        access.active = True
