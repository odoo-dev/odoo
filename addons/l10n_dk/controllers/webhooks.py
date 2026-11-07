from odoo import http
from odoo.http import request


class NemhandelWebhookController(http.Controller):

    @http.route(
        '/nemhandel/webhook/new-message',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
    )
    def webhook_nemhandel_new_message(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_nemhandel_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._l10n_dk__ir_cron_nemhandel_get_new_documents_optional:
            request.env['ir.cron']._l10n_dk__ir_cron_nemhandel_get_new_documents_optional.sudo()._trigger()

        return http.Response(status=204)

    @http.route(
        '/nemhandel/webhook/message-state-update',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
    )
    def webhook_nemhandel_message_update(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_nemhandel_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._l10n_dk__ir_cron_nemhandel_get_message_status_optional:
            request.env['ir.cron']._l10n_dk__ir_cron_nemhandel_get_message_status_optional.sudo()._trigger()

        return http.Response(status=204)

    @http.route(
        '/nemhandel/webhook/user-state-update',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
    )
    def webhook_nemhandel_user_update(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_nemhandel_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._l10n_dk__ir_cron_nemhandel_get_participant_status:
            request.env['ir.cron']._l10n_dk__ir_cron_nemhandel_get_participant_status.sudo()._trigger()

        return http.Response(status=204)
