# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import _, fields, models, modules, tools
from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError
from odoo.addons.l10n_dk_nemhandel.tools.demo_utils import handle_demo
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class AccountEdiProxyClientUser(models.Model):
    _inherit = 'account_edi_proxy_client.user'

    l10n_dk_nemhandel_verification_code = fields.Char(string='SMS verification code')
    proxy_type = fields.Selection(selection_add=[('l10n_dk_nemhandel', 'Nemhandel')], ondelete={'l10n_dk_nemhandel': 'cascade'})

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    @handle_demo
    def _make_request(self, url, params=False):
        # extends account_edi_proxy_client to update l10n_dk_nemhandel_proxy_state
        # of archived users
        try:
            result = super()._make_request(url, params)
        except AccountEdiProxyError as e:
            if (
                e.code == 'no_such_user'
                and not self.active
                and not self.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'l10n_dk_nemhandel')
            ):
                self.company_id.write({
                    'account_peppol_proxy_state': 'not_registered',
                })
                # commit the above changes before raising below
                if not tools.config['test_enable'] and not modules.module.current_test:
                    self.env.cr.commit()
            raise AccountEdiProxyError(e.code, e.message)
        return result

    def _get_proxy_urls(self):
        urls = super()._get_proxy_urls()
        # TODO
        urls['l10n_dk_nemhandel'] = {
            'prod': 'https://nemhandel.api.odoo.com',
            'test': 'https://nemhandel.test.odoo.com',
            'demo': 'demo',
        }
        return urls

    # -------------------------------------------------------------------------
    # CRONS
    # -------------------------------------------------------------------------

    def _cron_l10n_dk_nemhandel_get_new_documents(self):
        edi_users = self.search([('company_id.l10n_dk_nemhandel_proxy_state', '=', 'active')])
        edi_users._l10n_dk_nemhandel_get_new_documents()

    def _cron_l10n_dk_nemhandel_get_message_status(self):
        edi_users = self.search([('company_id.l10n_dk_nemhandel_proxy_state', '=', 'active')])
        edi_users._l10n_dk_nemhandel_get_message_status()

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def _get_proxy_identification(self, company, proxy_type):
        if proxy_type == 'l10n_dk_nemhandel':
            if not company.l10n_dk_nemhandel_identifier_type or not company.l10n_dk_nemhandel_identifier_value:
                raise UserError(
                    _("Please fill in the Identifier Type and Value."))
            return f'{company.l10n_dk_nemhandel_identifier_type}:{company.l10n_dk_nemhandel_identifier_value}'
        return super()._get_proxy_identification(company, proxy_type)

    def _l10n_dk_nemhandel_get_new_documents(self):
        params = {
            'domain': {
                'direction': 'incoming',
                'errors': False,
            }
        }
        for edi_user in self:
            proxy_acks = []
            params['domain']['receiver_identifier'] = edi_user.edi_identification
            try:
                # request all messages that haven't been acknowledged
                messages = edi_user._make_request(
                    url=f"{edi_user._get_server_url()}/api/l10n_dk_nemhandel/1/get_all_documents",
                    params=params,
                )
            except AccountEdiProxyError as e:
                _logger.error(
                    'Error while receiving the document from Nemhandel Proxy: %s', e.message)
                continue

            message_uuids = [
                message['uuid']
                for message in messages.get('messages', [])
            ]
            if not message_uuids:
                continue

            company = edi_user.company_id
            # retrieve attachments for filtered messages
            all_messages = edi_user._make_request(
                f"{edi_user._get_server_url()}/api/l10n_dk_nemhandel/1/get_document",
                {'message_uuids': message_uuids},
            )

            for uuid, content in all_messages.items():
                enc_key = content["enc_key"]
                document_content = content["document"]
                filename = content["filename"] or 'attachment' # default to attachment, which should not usually happen
                partner_endpoint = content["accounting_supplier_party"]
                decoded_document = edi_user._decrypt_data(document_content, enc_key)

                journal_id = company.l10n_dk_nemhandel_purchase_journal_id
                # use the first purchase journal if the l10n_dk_nemhandel journal is not set up
                # to create the move anyway
                if not journal_id:
                    journal_id = self.env['account.journal'].search([
                        *self.env['account.journal']._check_company_domain(company),
                        ('type', '=', 'purchase')
                    ], limit=1)

                attachment_vals = {
                    'name': f'{filename}.xml',
                    'raw': decoded_document,
                    'type': 'binary',
                    'mimetype': 'application/xml',
                }

                try:
                    attachment = self.env['ir.attachment'].create(attachment_vals)
                    move = journal_id\
                        .with_context(
                            default_move_type='in_invoice',
                            default_l10n_dk_nemhandel_move_state=content['state'],
                            default_extract_can_show_send_button=False,
                            default_l10n_dk_nemhandel_message_uuid=uuid,
                        )\
                        ._create_document_from_attachment(attachment.id)
                    if partner_endpoint:
                        move._message_log(body=_(
                            'Nemhandel document has been received successfully. Sender endpoint: %s', partner_endpoint))
                    else:
                        move._message_log(body=_('Nemhandel document has been received successfully'))
                # pylint: disable=broad-except
                except Exception:
                    # if the invoice creation fails for any reason,
                    # we want to create an empty invoice with the attachment
                    move = self.env['account.move'].create({
                        'move_type': 'in_invoice',
                        'l10n_dk_nemhandel_move_state': 'done',
                        'company_id': company.id,
                        'extract_can_show_send_button': False,
                        'l10n_dk_nemhandel_message_uuid': uuid,
                    })
                    attachment_vals.update({
                        'res_model': 'account.move',
                        'res_id': move.id,
                    })
                    self.env['ir.attachment'].create(attachment_vals)

                proxy_acks.append(uuid)

            if not tools.config['test_enable']:
                self.env.cr.commit()
            if proxy_acks:
                edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/l10n_dk_nemhandel/1/ack",
                    {'message_uuids': proxy_acks},
                )

    def _l10n_dk_nemhandel_get_message_status(self):
        for edi_user in self:
            edi_user_moves = self.env['account.move'].search([
                ('l10n_dk_nemhandel_move_state', '=', 'processing'),
                ('company_id', '=', edi_user.company_id.id),
            ])
            if not edi_user_moves:
                continue

            message_uuids = {move.l10n_dk_nemhandel_message_uuid: move for move in edi_user_moves}
            messages_to_process = edi_user._make_request(
                f"{edi_user._get_server_url()}/api/l10n_dk_nemhandel/1/get_document",
                {'message_uuids': list(message_uuids.keys())},
            )

            for uuid, content in messages_to_process.items():
                if uuid == 'error':
                    # this rare edge case can happen if the participant is not active on the proxy side
                    # in this case we can't get information about the invoices
                    edi_user_moves.l10n_dk_nemhandel_move_state = 'error'
                    log_message = _("Nemhandel error: %s", content['message'])
                    edi_user_moves._message_log_batch(bodies=dict((move.id, log_message) for move in edi_user_moves))
                    continue

                move = message_uuids[uuid]
                if content.get('error'):
                    move.l10n_dk_nemhandel_move_state = 'error'
                    move._message_log(body=_("Nemhandel error: %s", content['error']['message']))
                    continue

                move.l10n_dk_nemhandel_move_state = content['state']
                move._message_log(body=_('Nemhandel status update: %s', content['state']))

            if message_uuids:
                edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/l10n_dk_nemhandel/1/ack",
                    {'message_uuids': list(message_uuids.keys())},
                )

    def _cron_l10n_dk_nemhandel_get_participant_status(self):
        edi_users = self.search([('company_id.l10n_dk_nemhandel_proxy_state', '=', 'pending')])
        edi_users._l10n_dk_nemhandel_get_participant_status()

    def _l10n_dk_nemhandel_get_participant_status(self):
        for edi_user in self:
            try:
                proxy_user = edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/l10n_dk_nemhandel/1/participant_status")
            except AccountEdiProxyError as e:
                _logger.error('Error while updating Nemhandel participant status: %s', e)
                continue

            if proxy_user['l10n_dk_nemhandel_state'] in {'active', 'rejected', 'canceled'}:
                edi_user.company_id.l10n_dk_nemhandel_proxy_state = proxy_user['l10n_dk_nemhandel_state']
