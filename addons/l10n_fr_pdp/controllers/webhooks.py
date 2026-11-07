from odoo import http
from odoo.http import request


class PdpWebhookController(http.Controller):

    @http.route(
        '/peppol/webhook/new-regulatory-message',
        type='http',
        auth='public',
        methods=['POST'],
        csrf=False,
        save_session=False,
    )
    def webhook_regulatory_message(self, token):
        edi_client = request.env['account_edi_proxy_client.user'].sudo()._get_user_from_token(token, url=request.httprequest.url)

        if edi_client and request.env['ir.cron']._l10n_fr_pdp__ir_cron_pdp_get_regulatory_documents_optional:
            request.env['ir.cron']._l10n_fr_pdp__ir_cron_pdp_get_regulatory_documents_optional.sudo()._trigger()

        return http.Response(status=204)
