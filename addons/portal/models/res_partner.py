# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    default_billing_address_id = fields.Many2one('res.partner')
    default_shipping_partner_id = fields.Many2one('res.partner')

    def address_get(self, adr_pref=None):
        """ Return default billing and shipping address based on user preference. """
        result = super().address_get(adr_pref)
        if not adr_pref:
            return result

        for partner in self:
            if 'invoice' in adr_pref and partner.default_billing_address_id:
                result['invoice'] =  partner.default_billing_address_id.id
            elif 'delivery' in adr_pref and partner.default_shipping_partner_id:
                result['delivery'] = partner.default_shipping_partner_id.id
        return result

    @api.model
    def _get_frontend_writable_fields(self):
        """ The list of fields a portal/public user can change on their contact and address records. """
        return set(self._get_portal_mandatory_fields() + self._get_portal_optional_fields())

    def _can_edit_name(self):
        """ Name can be changed more often than the VAT """
        self.ensure_one()
        return True

    def can_edit_vat(self):
        """ `vat` is a commercial field, synced between the parent (commercial
        entity) and the children. Only the commercial entity should be able to
        edit it (as in backend)."""
        self.ensure_one()
        return not self.parent_id

    def _can_edited_by_current_customer(self, **kwargs):
        """ Return whether customer can be edited by current user's customer. """
        self.ensure_one()
        if self == self._get_current_partner(**kwargs):
            return True
        children_partner_ids = self.env['res.partner']._search([
            ('id', 'child_of', self.commercial_partner_id.id),
            ('type', 'in', ('invoice', 'delivery', 'other')),
        ])
        return self.id in children_partner_ids

    @api.model
    def _display_b2b_fields(self):
        """ This method is to check whether address form should display b2b fields. """
        return False

    @api.model
    def _get_current_partner(self, **kwargs):
        return self.env.user.partner_id

    @api.model
    def _get_portal_mandatory_fields(self):
        """ This method is there so that we can override the mandatory fields """
        return ['name', 'phone', 'email', 'street', 'city', 'country_id']

    @api.model
    def _get_portal_optional_fields(self):
        """ This method is there so that we can override the optional fields """
        return ['street2', 'zip', 'zipcode', 'state_id', 'vat', 'company_name']

    def _is_anonymous_customer(self):
        """ Hook to check if customer is anonymous or not. """
        return False
