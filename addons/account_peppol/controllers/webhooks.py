from odoo import http
from odoo.http import request


class PeppolWebhookController(http.Controller):

    @http.route(
        '/peppol/webhook/new-message',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
    )
    def webhook_new_message(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._account_peppol__ir_cron_peppol_get_new_documents_optional:
            request.env['ir.cron']._account_peppol__ir_cron_peppol_get_new_documents_optional.sudo()._trigger()

        return http.Response(status=204)

    @http.route(
        '/peppol/webhook/message-state-update',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
    )
    def webhook_message_update(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._account_peppol__ir_cron_peppol_get_message_status_optional:
            request.env['ir.cron']._account_peppol__ir_cron_peppol_get_message_status_optional.sudo()._trigger()

        return http.Response(status=204)

    @http.route(
        '/peppol/webhook/user-state-update',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
    )
    def webhook_user_update(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._account_peppol__ir_cron_peppol_get_participant_status_optional:
            request.env['ir.cron']._account_peppol__ir_cron_peppol_get_participant_status_optional.sudo()._trigger()

        return http.Response(status=204)
