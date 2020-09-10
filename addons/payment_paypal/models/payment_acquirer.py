# coding: utf-8
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PaymentAcquirer(models.Model):
    _inherit = 'payment.acquirer'

    provider = fields.Selection(
        selection_add=[('paypal', "Paypal")], ondelete={'paypal': 'set default'})
    paypal_email_account = fields.Char(
        string="Email", required_if_provider='paypal', groups='base.group_system')
    paypal_seller_account = fields.Char(
        string="Merchant Account ID", groups='base.group_system',
        help="This ensures that communications coming from Paypal are valid and secured.")
    paypal_pdt_token = fields.Char(
        string="PDT Identity Token",
        help="This allows to receive notifications of successful payments as they are made.",
        groups='base.group_system')
    paypal_use_ipn = fields.Boolean(
        string="Use IPN", help="Paypal Instant Payment Notification", default=True,
        groups='base.group_system')

    def _compute_fees(self, amount, currency, country):
        self.ensure_one()
        if self.provider != 'paypal':
            return super()._compute_fees(amount, currency, country)

        fees = 0.0
        if self.fees_active:
            if self.company_id.country_id == country:
                fixed = self.fees_dom_fixed
                variable = self.fees_dom_var
            else:
                fixed = self.fees_int_fixed
                variable = self.fees_int_var
            # The fees are to be subtracted from the amount. eg.: billed = 100, variable = 2.9%,
            # fixed = 0.30 -> PayPal takes 3.2 and merchant earns 96.8.
            # To actually earn 100, 103.3 must be billed: 103.3 * 2.9% + 0.3 = 3.3
            fees = (amount * variable / 100.0 + fixed) / (1 - variable / 100.0)
        return fees

    def _paypal_get_api_url(self):
        """ Return the API URL according to the acquirer state.

        Note: self.ensure_one()

        :return: The API URL
        :rtype: str
        """
        self.ensure_one()

        if self.state == 'enabled':
            return 'https://www.paypal.com/cgi-bin/webscr'
        else:
            return 'https://www.sandbox.paypal.com/cgi-bin/webscr'

    def _paypal_send_configuration_reminder(self):
        template = self.env.ref(
            'payment_paypal.mail_template_paypal_invite_user_to_configure', raise_if_not_found=False
        )
        if template:
            render_template = template._render({'acquirer': self}, engine='ir.qweb')
            mail_body = self.env['mail.render.mixin']._replace_local_links(render_template)
            mail_values = {
                'body_html': mail_body,
                'subject': _("Add your PayPal account to Odoo"),
                'email_to': self.paypal_email_account,
                'email_from': self.create_uid.email_formatted,
                'author_id': self.create_uid.partner_id.id,
            }
            self.env['mail.mail'].sudo().create(mail_values).send()
