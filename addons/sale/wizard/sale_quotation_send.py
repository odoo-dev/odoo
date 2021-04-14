# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError

class SaleQuotationSend(models.TransientModel):
    _name = 'sale.quotation.send'
    _description = 'Sale Quotation Send'

    active_draft_ids = fields.Many2many(
        string="Selected quotations draft",
        comodel_name='sale.order',
        relation='sale_order_draft_sale_quotation_send_rel',
        help="List of the selected quotation's ids in the state \"draft\".",
    )
    active_sale_ids = fields.Many2many(
        string="Sale Orders",
        comodel_name='sale.order',
        relation='sale_order_sale_sale_quotation_send_rel',
        help="List of the selected quotation's ids in the state \"sent\" or \"sale\".",
    )
    draft_template_id = fields.Many2one(
        string="Use template for Quotations",
        comodel_name='mail.template',
        index=True,
        domain='[("model", "=", "sale.order")]'
    )
    sale_template_id = fields.Many2one(
        string="Use template for Sale Orders",
        comodel_name='mail.template',
        index=True,
        domain='[("model", "=", "sale.order")]'
    )

    @api.model
    def default_get(self, fields):
        default = super(SaleQuotationSend, self).default_get(fields)
        active_draft_ids = self._context.get('active_draft_ids')
        active_sale_ids = self._context.get('active_sale_ids')

        draft_template_id = self._context.get('default_draft_template_id')
        sale_template_id = self._context.get('default_sale_template_id')

        if not active_draft_ids and not active_sale_ids:
            raise UserError(_("You should select at least one quotation."))

        default.update({
            'active_draft_ids': active_draft_ids,
            'active_sale_ids': active_sale_ids,
            'draft_template_id': draft_template_id,
            'sale_template_id': sale_template_id,
        })

        return default

    def send_quotation_action(self):
        self.ensure_one()

        if self.active_draft_ids:
            for quotation in self.active_draft_ids:
                responsible_emails_set = {user.email for user in filter(None, \
                    (quotation.user_id, self.env.ref('base.user_admin', raise_if_not_found=False)))}
                responsible_emails = ', '.join(responsible_emails_set)
                email_values = {'email_to': responsible_emails, 'reply_to':responsible_emails}
                mail_id = self.draft_template_id.send_mail(quotation.id,
                                                email_values=email_values,
                                                notif_layout=self._context.get('custom_layout'), # Add the template (header and footer)
                                                force_send=True,
                                            )
                if mail_id and quotation.state == 'draft':
                    quotation.write({'state': 'sent'})

        if self.active_sale_ids:
            for sale_order in self.active_sale_ids:
                responsible_emails_set = {user.email for user in filter(None, \
                    (sale_order.user_id, self.env.ref('base.user_admin', raise_if_not_found=False)))}
                responsible_emails = ', '.join(responsible_emails_set)
                email_values = {'email_to': responsible_emails, 'reply_to':responsible_emails}
                self.sale_template_id.send_mail(sale_order.id,
                                                email_values=email_values,
                                                notif_layout=self._context.get('custom_layout'), # Add the template (header and footer)
                                                force_send=True,
                                            )

        return {'type': 'ir.actions.act_window_close'}
