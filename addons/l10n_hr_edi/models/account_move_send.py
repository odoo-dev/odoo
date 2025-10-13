from datetime import timedelta

from odoo import _, fields, models
from odoo.addons.account_edi_proxy_client.models.account_edi_proxy_user import AccountEdiProxyError


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    # -------------------------------------------------------------------------
    # SENDING METHODS
    # -------------------------------------------------------------------------

    def _get_default_invoice_edi_format(self, move, **kwargs) -> str:
        # EXTENDS 'account'
        if 'mojeracun' in kwargs.get('sending_methods', []):
            return 'ubl_hr'

        return super()._get_default_invoice_edi_format(move, **kwargs)

    def _is_applicable_to_company(self, method, company):
        # EXTENDS 'account'
        if method == 'mojeracun':
            return company.l10n_hr_mer_proxy_state != 'rejected'
        return super()._is_applicable_to_company(method, company)

    def _is_applicable_to_move(self, method, move, **move_data):
        # EXTENDS 'account'
        if method == 'mojeracun':
            partner = move.partner_id.commercial_partner_id.with_company(move.company_id)
            invoice_edi_format = move_data.get('invoice_edi_format') or 'ubl_hr'
            return all([
                self._is_applicable_to_company(method, move.company_id),
                #partner._get_eracun_verification_state(invoice_edi_format) == 'valid', # Not required for MER
                move.company_id.l10n_hr_mer_proxy_state != 'rejected',
                move._need_ubl_cii_xml(invoice_edi_format)
                or move.ubl_cii_xml_id and move.l10n_hr_mer_document_status not in {'20', '30', '40'},
            ])

        return super()._is_applicable_to_move(method, move, **move_data)

    def _hook_if_errors(self, moves_data, allow_raising=True):
        # EXTENDS 'account'
        moves_failed_file_generation = self.env['account.move']
        for move, move_data in moves_data.items():
            if 'mojeracun' in move_data['sending_methods'] and move_data.get('blocking_error'):
                moves_failed_file_generation |= move

        moves_failed_file_generation.l10n_hr_mer_document_status = '45'

        return super()._hook_if_errors(moves_data, allow_raising=allow_raising)

    def _call_web_service_after_invoice_pdf_render(self, invoices_data):
        print("--- DEBUG: _call_web_service() ---")
        # EXTENDS 'account'
        super()._call_web_service_after_invoice_pdf_render(invoices_data)

        #self.env.invalidate_all()
        #self.env.flush_all()
        params = {'documents': []}
        for invoice, invoice_data in invoices_data.items():
            print("--- DEBUG: _call_web_service() - loop:", invoice, "---")
            # Looks like MojEracun determines the receiver endpoint entirely from the XML
            # (as there are no other parameters for the send API), so no need to check for partner endpoint
            #partner = invoice.partner_id.commercial_partner_id.with_company(invoice.company_id)
            if 'mojeracun' not in invoice_data['sending_methods']:
                print("--- DEBUG: _call_web_service() - not in sending methods! ---")
                continue

            """if not partner.eracun_identifier_type or not partner.eracun_identifier_value:
                invoice.eracun_move_state = 'error'
                invoice_data['error'] = _('The partner is missing eRacun Endpoint Type or Value.')
                continue"""

            # Verification of a partner existing can be done with check ID API if it starts working,
            # but otherwise there is no such thing as externally available MER ID to even save
            """if partner._get_eracun_verification_state(invoice_data['invoice_edi_format']) != 'valid':
                invoice.eracun_move_state = 'error'
                invoice_data['error'] = _('Please verify partner configuration in partner settings.')
                continue"""

            if not self._is_applicable_to_move('mojeracun', invoice, **invoice_data):
                print("--- DEBUG: _call_web_service() - not appliccable! ---")
                continue

            if invoice_data.get('ubl_cii_xml_attachment_values'):
                print("--- DEBUG: _call_web_service() - getting raw from invoice_data ---")
                xml_file = invoice_data['ubl_cii_xml_attachment_values']['raw']
                #filename = invoice_data['ubl_cii_xml_attachment_values']['name']
            # Check appliccable states!
            elif invoice.ubl_cii_xml_id and invoice.l10n_hr_mer_document_status not in {'20', '30', '40'}:
                print("--- DEBUG: _call_web_service() - getting raw from invoice ---")
                xml_file = invoice.ubl_cii_xml_id.raw
                #filename = invoice.ubl_cii_xml_id.name
            else:
                print("--- DEBUG: _call_web_service() - error getting xml ---")
                invoice.l10n_hr_mer_document_status = '45'
                builder = invoice.partner_id.commercial_partner_id._get_edi_builder(invoice_data['invoice_edi_format'])
                invoice_data['error'] = _(
                    "Errors occurred while creating the EDI document (format: %s):",
                    builder._description,
                )
                continue

            #receiver_identification = f"{partner.eracun_identifier_type}:{partner.eracun_identifier_value}"
            """params['documents'].append({
                'filename': filename,
                #'receiver': receiver_identification,
                'ubl': b64encode(xml_file).decode(),
            })
            invoices_data_mer[invoice] = invoice_data"""

            # For MojEracun, we can only send invoices one by one
            """if not params['documents']:
                print("--- DEBUG: _call_web_service() - no documents! ---")
                return"""

            edi_user = invoice.company_id.l10n_hr_mojeracun_user

            print("--- DEBUG: _call_web_service(): xml_file:", xml_file[:100], "---")
            # This instead should call the _mer_send() method now, giving it only needs the move itself.
            try:
                response = edi_user._mer_api_send(xml_file.decode())
            except AccountEdiProxyError as e:
                print("--- DEBUG: _call_web_service() - error sending 1 ---")
                invoice.l10n_hr_mer_document_status = '45'
                invoice_data['error'] = e.message
            else:
                print("--- DEBUG: _call_web_service() - response:", response,  "---")
                if response.status_code != 200:
                    invoice.l10n_hr_mer_document_status = '45'
                    invoice_data['error'] = f"HTTP error: status code {response.status_code}"
                else:
                    if response.json().get('File'): # This appears to be the "error" format
                        print("--- DEBUG: _call_web_service() - error sending:", response.json().get('File'), "---")
                        invoice.l10n_hr_mer_document_status = '45'
                        invoice_data['error'] = response.json().get('File')
                    else:
                        print("--- DEBUG: _call_web_service() - response:", response.json(), "---")
                        invoice.l10n_hr_mer_document_id = response.json()['ElectronicId']
                        invoice.l10n_hr_mer_document_status = '20'
                        log_message = _('The document has been sent to MojEracun service provider for processing')
                        invoice._message_log(body=log_message)
                        self.env.ref('l10n_hr_edi.ir_cron_mer_update_outbox_document_status')._trigger(at=fields.Datetime.now() + timedelta(minutes=5))

        if self._can_commit():
            self._cr.commit()
