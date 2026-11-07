# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    _crm_iap_enrich__ir_cron_lead_enrichment_optional = models.Ref('crm_iap_enrich.ir_cron_lead_enrichment', 'ir.cron', required=False)

    @api.model
    def get_values(self):
        values = super(ResConfigSettings, self).get_values()
        cron = self.sudo().with_context(active_test=False)._crm_iap_enrich__ir_cron_lead_enrichment_optional
        values['lead_enrich_auto'] = 'auto' if cron.active else 'manual'
        return values

    def set_values(self):
        super().set_values()
        cron = self.sudo().with_context(active_test=False)._crm_iap_enrich__ir_cron_lead_enrichment_optional
        if cron and cron.active != (self.lead_enrich_auto == 'auto'):
            cron.active = self.lead_enrich_auto == 'auto'
