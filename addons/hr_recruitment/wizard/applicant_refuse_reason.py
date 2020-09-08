# -*- coding: utf-8 -*-
import logging

from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ApplicantGetRefuseReason(models.TransientModel):
    _name = 'applicant.get.refuse.reason'
    _description = 'Get Refuse Reason'

    @api.model
    def default_get(self, fields):
        if not self.env.user.email:
            raise UserError(_("Unable to post message, please configure the sender's email address."))
        res = super().default_get(fields)
        applicant_ids = self.env.context.get('default_applicant_ids')
        if 'partner_ids' in fields and applicant_ids:
            res.update({'partner_ids': self.env['hr.applicant'].browse(applicant_ids).mapped('partner_id.id')})
        return res

    refuse_reason_id = fields.Many2one('hr.applicant.refuse.reason', 'Refuse Reason')
    applicant_ids = fields.Many2many('hr.applicant')
    partner_ids = fields.Many2many('res.partner', string='Recipients')
    applicant_without_email = fields.Text(compute='_compute_applicant_without_email', string='applicant(s) not having email')
    subject = fields.Char('Subject', compute='_compute_body', store=True, readonly=False)
    body = fields.Html('Contents', sanitize_style=True, compute='_compute_body', store=True, readonly=False)
    attachment_ids = fields.Many2many(
        'ir.attachment', 'hr_recruitment_mail_compose_message_ir_attachments_rel',
        'wizard_id', 'attachment_id', string='Attachments')
    template_id = fields.Many2one('mail.template', "Email Templates", compute='_compute_template_id', store=True, readonly=False, domain="[('model', '=', 'hr.applicant')]")
    email_from = fields.Char(
        'From', required=True,
        default=lambda self: self.env.user.email_formatted,
        help="Email address of the sender",
    )
    author_id = fields.Many2one(
        'res.partner', string='Author', required=True,
        default=lambda self: self.env.user.partner_id.id,
        help="Author of the message.",
    )

    @api.depends('applicant_ids')
    def _compute_applicant_without_email(self):
        for wizard in self:
            applicants = self.env['hr.applicant'].search([
                ('id', 'in', wizard.applicant_ids.ids),
                '|', ('email_from', '=', False), ('partner_id.email', '=', False)
            ])
            if applicants:
                wizard.applicant_without_email = "%s\n%s" % (
                    _("The email will not be sent to following applicant(s) as they don't have email address."),
                    "\n".join([i.partner_name for i in applicants])
                )
            else:
                wizard.applicant_without_email = False

    @api.depends('refuse_reason_id')
    def _compute_template_id(self):
        for wizard in self.filtered(lambda x: x.refuse_reason_id):
            wizard.template_id = wizard.refuse_reason_id.template_id

    @api.depends('template_id')
    def _compute_body(self):
        for wizard in self.filtered(lambda w: w.template_id):
            wizard.subject = wizard.template_id.subject
            wizard.body = wizard.template_id.body_html

    def action_refuse_reason_apply(self):
        return self.applicant_ids.write({'refuse_reason_id': self.refuse_reason_id.id, 'active': False})

    def _send_email(self, applicant):
        RenderMixin = self.env['mail.render.mixin']
        subject = RenderMixin._render_template(self.subject, 'hr.applicant', applicant.ids, post_process=True)
        body = RenderMixin._render_template(self.body, 'hr.applicant', applicant.ids, post_process=True)
        # post the message
        partner_ids = self.partner_ids.filtered(lambda partner: partner == applicant.partner_id or partner not in self.applicant_ids.mapped('partner_id'))
        mail_values = {
            'email_from': self.email_from,
            'author_id': self.author_id.id,
            'model': None,
            'res_id': None,
            'subject': subject[applicant.id],
            'body_html': body[applicant.id],
            'recipient_ids': partner_ids,
            'attachment_ids': [(4, att.id) for att in self.attachment_ids],
            'auto_delete': True,
        }

        try:
            template = self.env.ref('mail.mail_notification_light', raise_if_not_found=True)
        except ValueError:
            _logger.warning('QWeb template mail.mail_notification_light not found when sending refuse reason mails. Sending without layouting.')
        else:
            template_ctx = {
                'message': self.env['mail.message'].sudo().new(dict(body=mail_values['body_html'], record_name=self.template_id.name)),
                'model_description': self.env['ir.model']._get('applicant.get.refuse.reason').display_name,
                'company': self.env.company,
            }
            body = template._render(template_ctx, engine='ir.qweb', minimal_qcontext=True)
            mail_values['body_html'] = self.env['mail.render.mixin']._replace_local_links(body)
        return self.env['mail.mail'].sudo().create(mail_values)

    def action_send_mail(self):
        self.ensure_one()
        self.applicant_ids.write({'refuse_reason_id': self.refuse_reason_id.id, 'active': False})
        if self.template_id and self.partner_ids:
            for applicant in self.applicant_ids.filtered(lambda x: x.partner_id in self.partner_ids):
                self._send_email(applicant)
        return {'type': 'ir.actions.act_window_close'}
