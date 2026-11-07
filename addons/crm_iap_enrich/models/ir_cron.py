from odoo import models


class IrCron(models.Model):
    _inherit = 'ir.cron'

    _crm_iap_enrich__ir_cron_lead_enrichment = models.Ref('crm_iap_enrich.ir_cron_lead_enrichment', 'ir.cron')
