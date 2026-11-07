# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models


def _synchronize_cron(env):
    config = env['ir.config_parameter'].get_str('crm.iap.lead.enrich.setting') or 'auto'
    env['ir.cron']._crm_iap_enrich__ir_cron_lead_enrichment.active = config == 'auto'
