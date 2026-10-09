import logging
import requests

from odoo import models
from odoo.addons.l10n_gr_edi_e_invoo_bridge import EInvooAuthenticationError, EInvooRequestError

E_INVOO_API_URL = 'https://e-invoo.com/aade/api'
E_INVOO_TEST_API_URL = 'https://test.e-invoo.com/aade/api'
E_INVOO_TIMEOUT = (5, 30)

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _l10n_gr_edi_format_e_invoo_response(self, response):
        result = {
            'upstream_status': response.status_code,
            'response': None,
        }

        if not response.content:
            return result

        try:
            result['response'] = response.json()
        except ValueError:
            pass

        return result

    def _l10n_gr_edi_post_e_invoo(self, api_token, endpoint, test_env, **request_kwargs):
        base_url = E_INVOO_TEST_API_URL if test_env else E_INVOO_API_URL
        try:
            response = requests.post(
                f'{base_url}/{endpoint}',
                headers={
                    'Authorization': f'Bearer {api_token}',
                    'Accept': 'application/json',
                },
                timeout=E_INVOO_TIMEOUT,
                allow_redirects=False,
                **request_kwargs,
            )
        except requests.RequestException as error:
            _logger.warning("e-invoo request to %s failed", endpoint)
            raise EInvooRequestError from error

        result = self._l10n_gr_edi_format_e_invoo_response(response)
        provider_response = result.get('response')
        if (
            isinstance(provider_response, dict)
            and provider_response.get('success') is False
            and provider_response.get('error') == 'Invalid API token'
        ):
            _logger.warning("e-invoo rejected the API token on %s", endpoint)
            raise EInvooAuthenticationError

        return result

    def _l10n_gr_edi_issue_invoice(self, api_token, test_env, *, xml, invoice_name, invoice_amount_total, invoice_datetime, invoice_id, invoice_currency=None, issue_date=None):
        form_values = {
            'send_action': 'post_invoices',
            'xml': xml,
            'invoice_name': invoice_name,
            'invoice_amount_total': invoice_amount_total,
            'invoice_datetime': invoice_datetime,
            'move_id': invoice_id,
        }
        if invoice_currency:
            form_values['invoice_currency'] = invoice_currency
        if issue_date:
            form_values['issue_date'] = issue_date

        return self._l10n_gr_edi_post_e_invoo(
            api_token,
            endpoint='send_invoice',
            test_env=test_env,
            files={key: (None, str(value)) for key, value in form_values.items()},
        )

    def _l10n_gr_edi_send_invoices(self):
        # OVERRIDE 'l10n_gr_edi_e_invoo'
        """Send customer invoices individually through Methodoos."""
        for company, invoices in self.grouped('company_id').items():
            api_token = company.sudo().l10n_gr_edi_methodoos_api_token
            if not api_token:
                error_message = self.env._(
                    "The Methodoos API token is not configured. Please configure it in the settings."
                )
                for invoice in invoices:
                    invoice._l10n_gr_edi_create_error_document({'error': error_message})
                continue

            for invoice in invoices:
                submission = invoice._l10n_gr_edi_prepare_invoice_submission()
                if not submission:
                    continue

                document, request_values = submission
                try:
                    result = self._l10n_gr_edi_issue_invoice(
                        api_token,
                        test_env=company.l10n_gr_edi_test_env,
                        **request_values,
                    )
                except EInvooAuthenticationError:
                    document.write({
                        'state': 'invoice_error',
                        'message': self.env._("The Methodoos API token is invalid. Please check it in the Accounting settings."),
                    })
                except EInvooRequestError:
                    document.message = self.env._(
                        "The electronic invoice submission result could not be confirmed."
                        "Retry the submission to retrieve the existing result."
                    )
                else:
                    invoice._l10n_gr_edi_handle_invoice_provider_result(document, result)

                if self._can_commit():
                    self.env.cr.commit()
