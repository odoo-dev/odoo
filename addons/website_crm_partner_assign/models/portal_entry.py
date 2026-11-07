from odoo import models


class PortalOpportunityCard(models.Model):
    _inherit = 'portal.entry'

    _website_crm_partner_assign__portal_entry_opportunities = models.Ref(
        'website_crm_partner_assign.portal_entry_opportunities', 'portal.entry', required=False)

    def _filter_visible_portal_cards(self):
        visible_entries = super()._filter_visible_portal_cards()
        opportunity_entry = self._website_crm_partner_assign__portal_entry_opportunities
        if opportunity_entry in self:
            if self.env.user.partner_id.grade_id or self.env.user.commercial_partner_id.grade_id:
                visible_entries |= opportunity_entry
            else:
                visible_entries -= opportunity_entry
        return visible_entries
