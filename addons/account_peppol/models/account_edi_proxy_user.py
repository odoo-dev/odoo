# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import _, api, fields, models, modules, tools
from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError
from odoo.addons.account_peppol.exceptions import get_ebms_message, get_exception_message
from odoo.addons.account_peppol.tools.demo_utils import handle_demo
from odoo.exceptions import UserError
from odoo.tools import split_every

_logger = logging.getLogger(__name__)
BATCH_SIZE = 50


class AccountEdiProxyClientUser(models.Model):
    _inherit = 'account_edi_proxy_client.user'

    peppol_verification_code = fields.Char(string='SMS verification code')
    proxy_type = fields.Selection(selection_add=[('peppol', 'PEPPOL')], ondelete={'peppol': 'cascade'})

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    @api.model
    def _get_peppol_error_message(self, error_vals):
        """
        Helper to process the error dictionary returned from the IAP response.
        It will only get the code (or EBMS code) and map it to the correct translated message.
        :param dict error_vals: the dictionary of encoded error json generated from the `_json` method in `peppol_proxy`
        :return: the translated error message
        :rtype: str
        """
        default_error_message = _('Unknown Peppol Error: %s', error_vals)

        if (ebms_code := error_vals.get('ebms_code')) and ebms_code != 4:
            # Error with ebMS code is originally from PeppolInboundError
            # In most case, ebMS message will be better and more specific, except for when the code is 4 (general "Other" message)
            error_message = get_ebms_message(ebms_code, default_error_message)
        else:
            error_message = get_exception_message(error_vals['code'], default_error_message)

        if (msg_args_count := error_message.count("%s")) and msg_args_count == len(error_vals['args']):
            error_message = error_message % tuple(error_vals['args'])

        return _(
            source="Peppol Error [code=%(error_code)s]: %(error_subject)s\n%(error_message)s",
            error_code=error_vals['code'],
            error_subject=error_vals['subject'],
            error_message=error_message,
        )

    def _make_request(self, url, params=False):
        if self.proxy_type == 'peppol':
            return self._make_request_peppol(url, params=params)
        return super()._make_request(url, params=params)

    @handle_demo
    def _make_request_peppol(self, url, params=False):
        # extends account_edi_proxy_client to update peppol_proxy_state
        # of archived users
        try:
            result = super()._make_request(url, params)
        except AccountEdiProxyError as e:
            if (
                e.code == 'no_such_user'
                and not self.active
                and not self.company_id.account_edi_proxy_client_ids.filtered(lambda u: u.proxy_type == 'peppol')
            ):
                self.company_id.write({
                    'account_peppol_proxy_state': 'not_registered',
                    'account_peppol_migration_key': False,
                })
                # commit the above changes before raising below
                if not tools.config['test_enable'] and not modules.module.current_test:
                    self.env.cr.commit()
            raise AccountEdiProxyError(e.code, e.message)

        if error_vals := result.get('error'):
            error_message = self._get_peppol_error_message(error_vals)
            raise UserError(error_message)

        return result

    def _get_proxy_urls(self):
        urls = super()._get_proxy_urls()
        urls['peppol'] = {
            'prod': 'https://peppol.api.odoo.com',
            'test': 'https://peppol.test.odoo.com',
            'demo': 'demo',
        }
        return urls

    # -------------------------------------------------------------------------
    # CRONS
    # -------------------------------------------------------------------------

    def _cron_peppol_get_new_documents(self):
        edi_users = self.search([('company_id.account_peppol_proxy_state', '=', 'active')])
        edi_users._peppol_get_new_documents()

    def _cron_peppol_get_message_status(self):
        edi_users = self.search([('company_id.account_peppol_proxy_state', '=', 'active')])
        edi_users._peppol_get_message_status()

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    def _get_proxy_identification(self, company, proxy_type):
        if proxy_type == 'peppol':
            if not company.peppol_eas or not company.peppol_endpoint:
                raise UserError(
                    _("Please fill in the EAS code and the Participant ID code."))
            return f'{company.peppol_eas}:{company.peppol_endpoint}'
        return super()._get_proxy_identification(company, proxy_type)

    def _peppol_get_new_documents(self):
        params = {
            'domain': {
                'direction': 'incoming',
                'errors': False,
            }
        }
        for edi_user in self:
            params['domain']['receiver_identifier'] = edi_user.edi_identification
            try:
                # request all messages that haven't been acknowledged
                messages = edi_user._make_request(
                    url=f"{edi_user._get_server_url()}/api/peppol/1/get_all_documents",
                    params=params,
                )
            except AccountEdiProxyError as e:
                _logger.error(
                    'Error while receiving the document from Peppol Proxy: %s', e.message)
                continue

            message_uuids = [
                message['uuid']
                for message in messages.get('messages', [])
            ]
            if not message_uuids:
                continue

            company = edi_user.company_id
            journal = company.peppol_purchase_journal_id
            # use the first purchase journal if the Peppol journal is not set up
            # to create the move anyway
            if not journal:
                journal = self.env['account.journal'].search([
                    *self.env['account.journal']._check_company_domain(company),
                    ('type', '=', 'purchase')
                ], limit=1)

            for uuids in split_every(BATCH_SIZE, message_uuids):
                proxy_acks = []
                # retrieve attachments for filtered messages
                all_messages = edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/get_document",
                    {'message_uuids': uuids},
                )

                for uuid, content in all_messages.items():
                    enc_key = content["enc_key"]
                    document_content = content["document"]
                    filename = content["filename"] or 'attachment'  # default to attachment, which should not usually happen
                    decoded_document = edi_user._decrypt_data(document_content, enc_key)
                    attachment_vals = {
                        'name': f'{filename}.xml',
                        'raw': decoded_document,
                        'type': 'binary',
                        'mimetype': 'application/xml',
                    }

                    try:
                        attachment = self.env['ir.attachment'].create(attachment_vals)
                        move = journal\
                            .with_context(
                                default_move_type='in_invoice',
                                default_peppol_move_state=content['state'],
                                default_peppol_message_uuid=uuid,
                            )\
                            ._create_document_from_attachment(attachment.id)
                        move._message_log(body=_('Peppol document has been received successfully'))
                    # pylint: disable=broad-except
                    except Exception:  # noqa: BLE001
                        # if the invoice creation fails for any reason,
                        # we want to create an empty invoice with the attachment
                        move = self.env['account.move'].create({
                            'move_type': 'in_invoice',
                            'peppol_move_state': 'done',
                            'company_id': company.id,
                            'peppol_message_uuid': uuid,
                        })
                        attachment_vals.update({
                            'res_model': 'account.move',
                            'res_id': move.id,
                        })
                        self.env['ir.attachment'].create(attachment_vals)
                    if 'is_in_extractable_state' in move._fields:
                        move.is_in_extractable_state = False

                    proxy_acks.append(uuid)

                if not tools.config['test_enable']:
                    self.env.cr.commit()
                if proxy_acks:
                    edi_user._make_request(
                        f"{edi_user._get_server_url()}/api/peppol/1/ack",
                        {'message_uuids': proxy_acks},
                    )

    def _peppol_get_message_status(self):
        for edi_user in self:
            edi_user_moves = self.env['account.move'].search([
                ('peppol_move_state', '=', 'processing'),
                ('company_id', '=', edi_user.company_id.id),
            ])
            if not edi_user_moves:
                continue

            message_uuids = {move.peppol_message_uuid: move for move in edi_user_moves}
            for uuids in split_every(BATCH_SIZE, message_uuids.keys()):
                messages_to_process = edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/get_document",
                    {'message_uuids': uuids},
                )

                for uuid, content in messages_to_process.items():
                    if uuid == 'error':
                        # this rare edge case can happen if the participant is not active on the proxy side
                        # in this case we can't get information about the invoices
                        edi_user_moves.peppol_move_state = 'error'
                        log_message = _("Peppol error: %s", content['message'])
                        edi_user_moves._message_log_batch(bodies={move.id: log_message for move in edi_user_moves})
                        break

                    move = message_uuids[uuid]
                    if error_vals := content.get('error'):
                        if error_vals['code'] == 702:
                            # "Peppol request not ready" error:
                            # thrown when the IAP is still processing the message
                            continue
                        move.peppol_move_state = 'error'
                        error_message = self._get_peppol_error_message(error_vals)
                        move._message_log(body=error_message)
                    else:
                        move.peppol_move_state = content['state']
                        move._message_log(body=_('Peppol status update: %s', content['state']))

                edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/ack",
                    {'message_uuids': uuids},
                )

    def _cron_peppol_get_participant_status(self):
        edi_users = self.search([('company_id.account_peppol_proxy_state', 'in', ['pending', 'not_verified', 'sent_verification'])])
        edi_users._peppol_get_participant_status()

    def _peppol_get_participant_status(self):
        for edi_user in self:
            try:
                proxy_user = edi_user._make_request(
                    f"{edi_user._get_server_url()}/api/peppol/1/participant_status")
            except AccountEdiProxyError as e:
                _logger.error('Error while updating Peppol participant status: %s', e)
                continue

            state_map = {
                'active': 'active',
                'verified': 'pending',
                'rejected': 'rejected',
                'canceled': 'canceled',
            }

            if proxy_user['peppol_state'] in state_map:
                edi_user.company_id.account_peppol_proxy_state = state_map[proxy_user['peppol_state']]
