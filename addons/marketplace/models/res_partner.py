import logging

from odoo import _, Command, api, models

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.model
    def _restore_data_partner(self, default_name, xmlid):
        """ Create a partner and assign it the provided and previously valid xmlid. """
        partner = self.with_context(mail_create_nosubscribe=True).create({
            'name': default_name,
        })
        self.env['ir.model.data'].sudo().search([
            ('module', '=', 'marketplace'),
            ('name', '=', xmlid),
        ]).write({'res_id': partner.id})
        return partner

    def _marketplace_create_activity_set_state(self, user_id, state_code):
        """ Create an activity on the Marketplace partner for the salesperson to set the state.

        :param int user_id: The salesperson of the related Marketplace account.
        :param str state_code: The state code received from Amazon.
        :return: None.
        """
        activity_message = _(
            "This Marketplace partner was created with an invalid state (%s);" \
            " please set the correct state manually.",
            state_code,
        )
        self.activity_schedule(
            act_type_xmlid='mail.mail_activity_data_todo',
            user_id=user_id,
            note=activity_message,
        )
