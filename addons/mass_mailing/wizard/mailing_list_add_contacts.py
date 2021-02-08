# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _

class MailingListAddContacts(models.TransientModel):
    _name = "mailing.list.add.contacts"
    _description = "Add contacts to mailing list"

    contact_ids = fields.Many2many('mailing.contact')
    mailing_list_id = fields.Many2one('mailing.list', string='Mailing List', required=True)

    def action_add_contacts(self):
        self.ensure_one()

        action = {'type': 'ir.actions.act_window_close'}

        return self._add_contacts_to_mailing_list(action)

    def action_add_contacts_and_send_mailing(self):
        self.ensure_one()

        action = self.env["ir.actions.actions"]._for_xml_id("mass_mailing.mailing_mailing_action_mail")
        action['views'] = [[False, "form"]]
        action['target'] = 'current'
        action['context'] = {
            'default_contact_list_ids': [self.mailing_list_id.id]
        }

        return self._add_contacts_to_mailing_list(action)

    def _add_contacts_to_mailing_list(self, action):
        self.ensure_one()

        previous_count = len(self.mailing_list_id.contact_ids)
        self.mailing_list_id.write({
            'contact_ids': [(4, contact.id) for contact in self.contact_ids]
        })
        added_contacts_count = len(self.mailing_list_id.contact_ids) - previous_count

        message = _("%s Mailing contacts have been added. ", added_contacts_count)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'info',
                'message': message,
                'sticky': False,
                'next': action,
            }
        }
