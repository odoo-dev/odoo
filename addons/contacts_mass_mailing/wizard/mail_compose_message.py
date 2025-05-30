# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class MailComposeMessage(models.TransientModel):
    _inherit = 'mail.compose.message'
    
    schedule_date = fields.Datetime(string='Scheduled for')
            
    def action_schedul_mail(self, auto_commit=False):
        mass_mailing = self.env['mailing.mailing'].create(self._prepare_mailing_values())
        self.mass_mailing_id = mass_mailing.id
        self.mass_mailing_id.action_put_in_queue()
        
    def _prepare_mailing_values(self):
        now = fields.Datetime.now()
        return {
            'attachment_ids': [(6, 0, self.attachment_ids.ids)],
            'body_html': self.body,
            'campaign_id': self.campaign_id.id,
            'mailing_model_id': self.env['ir.model']._get(self.model).id,
            'mailing_domain': self.res_domain if self.res_domain else f"[('id', 'in', {self.res_ids})]",
            'name': self.mass_mailing_name,
            'reply_to': self.reply_to if self.reply_to_mode == 'new' else False,
            'reply_to_mode': self.reply_to_mode,
            'sent_date': now,
            'state': 'done',
            'subject': self.subject,
            'schedule_type': 'scheduled',
            'schedule_date': self.schedule_date,
        }
