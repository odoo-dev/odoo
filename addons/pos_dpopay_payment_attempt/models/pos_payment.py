# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, models


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    @api.model
    def _get_terminal_transaction_log_values(self, payment_method, request, response, **kwargs):
        if payment_method.payment_provider != 'dpopay':
            return super()._get_terminal_transaction_log_values(payment_method, request, response, **kwargs)
        source_id = request.get('sourceId')
        if not source_id:
            return {}  # Terminal readiness check, not a transaction.
        response = response if isinstance(response, dict) else {}
        error = response.get('errorMessage')
        description = response.get('resultCodeDescription') or response.get('displayText')
        values = {'transaction_id': source_id}
        endpoint = kwargs.get('endpoint')

        if endpoint == 'start-transaction':
            currency = payment_method.journal_id.currency_id or payment_method.company_id.currency_id
            try:
                values['amount'] = int(request.get('amount')) / 10 ** currency.decimal_places
            except (TypeError, ValueError):
                pass
            if kwargs.get('order_uuid'):
                values['pos_order_id'] = self.env['pos.order'].search([('uuid', '=', kwargs['order_uuid'])], limit=1).id
            if error:
                values.update(state='failed', message=error)
            else:
                values['state'] = 'processing'
        elif endpoint == 'get-status':
            if error == 'Transaction not found':
                values.update(state='failed', message=_("Unknown to the terminal"))
            elif error:
                return {}
            elif response.get('declined') or (response.get('complete') and not response.get('success')):
                values.update(state='failed', message=description)
            elif response.get('offline'):
                values.update(state='failed', message=_("Terminal offline"))
            elif not response.get('complete'):
                values['state'] = 'processing'
            else:
                return {}  # Approved; the result call marks the success.
        elif endpoint == 'get-result':
            if not response.get('success') or error:
                return {}
            values.update(state='success', message=description)
        elif endpoint == 'cancel-transaction':
            if not response.get('responseCode'):
                return {}
            values['state'] = 'timeout' if kwargs.get('cancel_reason') == 'timeout' else 'cancelled'
        else:
            return {}
        return values
