from odoo import models


class CrmTag(models.Model):
    _inherit = 'crm.tag'

    _website_crm_partner_assign__tag_portal_lead_is_spam = models.Ref('website_crm_partner_assign.tag_portal_lead_is_spam', required=False)
    _website_crm_partner_assign__tag_portal_lead_own_opp = models.Ref('website_crm_partner_assign.tag_portal_lead_own_opp', required=False)
    _website_crm_partner_assign__tag_portal_lead_partner_unavailable = models.Ref('website_crm_partner_assign.tag_portal_lead_partner_unavailable', required=False)
