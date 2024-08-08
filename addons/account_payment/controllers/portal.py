# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.addons.account.controllers import portal
from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment.controllers.portal import PaymentPortal
from odoo.http import request


class PortalAccount(portal.PortalAccount, PaymentPortal):

    def _invoice_get_page_view_values(self, invoice, access_token, payment=False, **kwargs):
        # EXTENDS account

        values = super()._invoice_get_page_view_values(invoice, access_token, **kwargs)

        if not invoice._has_to_be_paid():
            # Do not compute payment-related stuff if given invoice doesn't have to be paid.
            return {
                **values,
                'payment': payment,  # We want to show the dialog even when everything has been paid (with a custom message)
            }

        logged_in = not request.env.user._is_public()
        # We set partner_id to the partner id of the current user if logged in, otherwise we set it
        # to the invoice partner id. We do this to ensure that payment tokens are assigned to the
        # correct partner and to avoid linking tokens to the public user.
        partner_sudo = request.env.user.partner_id if logged_in else invoice.partner_id
        invoice_company = invoice.company_id or request.env.company

        availability_report = {}
        # Select all the payment methods and tokens that match the payment context.
        providers_sudo = request.env['payment.provider'].sudo()._get_compatible_providers(
            invoice_company.id,
            partner_sudo.id,
            invoice.amount_total,
            currency_id=invoice.currency_id.id,
            report=availability_report,
        )  # In sudo mode to read the fields of providers and partner (if logged out).
        payment_methods_sudo = request.env['payment.method'].sudo()._get_compatible_payment_methods(
            providers_sudo.ids,
            partner_sudo.id,
            currency_id=invoice.currency_id.id,
            report=availability_report,
        )  # In sudo mode to read the fields of providers.
        tokens_sudo = request.env['payment.token'].sudo()._get_available_tokens(
            providers_sudo.ids, partner_sudo.id
        )  # In sudo mode to read the partner's tokens (if logged out) and provider fields.

        # Make sure that the partner's company matches the invoice's company.
        company_mismatch = not PaymentPortal._can_partner_pay_in_company(
            partner_sudo, invoice_company
        )

        portal_page_values = {
            'company_mismatch': company_mismatch,
            'expected_company': invoice_company,
            'payment': payment,
        }
        payment_form_values = {
            'show_tokenize_input_mapping': PaymentPortal._compute_show_tokenize_input_mapping(
                providers_sudo
            ),
        }
        installment = invoice.get_next_installment_due()
        next_installment = (
            installment
            and installment['type'] != 'early_payment_discount'
            and installment['amount_residual_currency_unsigned'] != invoice.amount_residual
        )
        payment_context = {
            'amount': invoice.amount_residual,
            'amount_custom': float(kwargs['amount']) if kwargs.get('amount') else 0.0,
            'amount_next_installment': installment['amount_residual_currency_unsigned'] if next_installment else 0.0,
            'currency': invoice.currency_id,
            'partner_id': partner_sudo.id,
            'providers_sudo': providers_sudo,
            'payment_methods_sudo': payment_methods_sudo,
            'tokens_sudo': tokens_sudo,
            'availability_report': availability_report,
            'invoice_id': invoice.id,
            'invoice_name': invoice.name,
            'invoice_name_installment': f"{invoice.name}-{installment['number']}" if next_installment else "",
            'transaction_route': f'/invoice/transaction/{invoice.id}/',
            'landing_route': invoice.get_portal_url(),
            'access_token': access_token,
        }
        # Merge the dictionaries while allowing the redefinition of keys.
        new_values = portal_page_values | payment_form_values | payment_context | self._get_extra_payment_form_values(**kwargs)
        values |= new_values
        return values

    @http.route()
    def portal_my_invoice_detail(self, invoice_id, access_token=None, report_type=None, download=False, **kw):
        # EXTENDS account

        # If we have a custom payment amount, make sure it hasn't been tampered with
        if kw.get('amount') and not payment_utils.check_access_token(
            kw.get('payment_token'), invoice_id, kw.get('amount')
        ):
            return request.redirect('/my')
        return super().portal_my_invoice_detail(invoice_id, access_token, report_type, download, **kw)
