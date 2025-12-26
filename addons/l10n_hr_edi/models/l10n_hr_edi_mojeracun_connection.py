"""
MojEracun version of the proxy user model, set up as an AbstractModel as the data is held on res_company.
The integration requires a lot of adjustments to work directly with an extrenal service provier and the original
edi_proxy_user cannot be used as a basis as it is too closely tied to Odoo's own IAP server structure.
"""

import json
import logging
import requests

from odoo import models, modules, tools
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)
BATCH_SIZE = 50
TIMEOUT = 30


class MojEracunServiceError(Exception):

    def __init__(self, code, message=False):
        self.code = code
        self.message = message
        super().__init__(message or code)


class L10nHrMojEracunConnection(models.AbstractModel):
    _name = 'l10n_hr_edi.mojeracun_connection'
    _description = 'MojEracun external service proxy user for HR eRacun'

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _get_server_url(self, company, edi_mode=None):
        edi_mode = edi_mode or company.l10n_hr_mer_connection_mode
        urls = {
            'prod': 'https://www.moj-eracun.hr',
            'test': 'https://demo.moj-eracun.hr',
            'demo': '???',
        }
        return urls[edi_mode]

    def _make_request(self, company, endpoint, params=False):
        """
        Returns:
            For multiple document endpoints (such as query*): list of dicts
            For single document endpoints (such as markPaid): dict
            For receive specifically: bytestring
        """
        payload = params
        url = f"{self._get_server_url(company)}{endpoint}"

        # Last barrier : in case the demo mode is not handled by the caller, we block access.
        if company.l10n_hr_mer_connection_mode == 'demo':
            raise MojEracunServiceError("block_demo_mode", "Can't access the proxy in demo mode")

        try:
            response = requests.post(
                url,
                json=payload,
                timeout=TIMEOUT,
                headers={'content-type': 'application/json', 'charset': 'utf-8'}
            )
        except (ValueError, requests.exceptions.ConnectionError, requests.exceptions.MissingSchema, requests.exceptions.Timeout, requests.exceptions.HTTPError):
            raise MojEracunServiceError('connection_error',
                self.env._('The url that this service requested returned an error. The url it tried to contact was %s', url))

        # Not a good way to handle errors, but the structure is inconsistent
        if response.status_code != 200:
            try:
                error_message = response.json().get('message')
            except (requests.exceptions.JSONDecodeError, TypeError):
                error_message = False
            raise UserError(self.env._("Error handling request: %s", error_message) if error_message else self.env._("HTTP %s: Connection error.", response.status_code))

        if endpoint != '/apis/v2/receive':  # Adjust this value here too if receive endpoint changes
            try:
                response = response.json()
            except (requests.exceptions.JSONDecodeError, TypeError):
                raise MojEracunServiceError('Invalid response format received')
            if 'error' in response:
                message = self.env._('The url that this service requested returned an error. The url it tried to contact was %(url)s. %(error_message)s', url=url, error_message=response['error']['message'])
                if response['error']['code'] == 404:
                    message = self.env._('The url that this service tried to contact does not exist. The url was “%s”', url)
                raise MojEracunServiceError('connection_error', message)
            return response
        else:
            return response._content

    def _call_mer_service(self, company, endpoint, params=None):
        params_base = {
            'Username': company.l10n_hr_mer_username,
            'Password': company.l10n_hr_mer_password,
            'CompanyId': company.l10n_hr_mer_company_ident,
            'CompanyBu': company.partner_id.l10n_hr_business_unit_code,
            'SoftwareId': company.l10n_hr_mer_software_ident,
        }
        if params:
            params = params_base | params
        else:
            params = params_base
        params_to_delete = []
        for key, value in params.items():
            if not value:
                params_to_delete.append(key)
        for key in params_to_delete:
            params.pop(key)
        try:
            response = self._make_request(
                company,
                endpoint,
                params=params,
            )
        except MojEracunServiceError as e:
            raise UserError(e.message)

        return response

    # -------------------------------------------------------------------------
    # CRONS
    # -------------------------------------------------------------------------

    def _cron_mer_get_new_documents(self):
        edi_user_companies = self.env['res.company'].search([('l10n_hr_mer_connection_state', '=', 'active')])
        for company in edi_user_companies:
            self._mer_get_new_documents(company, from_cron=True)

    def _cron_mer_update_document_status(self):
        edi_user_companies = self.env['res.company'].search([('l10n_hr_mer_connection_state', '=', 'active')])
        for company in edi_user_companies:
            self._mer_fetch_document_status_company(company, from_cron=True)

    # -------------------------------------------------------------------------
    # MOJERACUN API CALL METHODS
    # -------------------------------------------------------------------------

    def _mer_api_ping(self, company):
        """
        Checks if service is up.
        """
        return requests.get(f'{self._get_server_url(company)}/apis/v2/Ping/')

    def _mer_api_send(self, company, xml_file):
        """
        Send electronic document to a recipient.
        """
        params = {
            'File': xml_file,
        }
        response_dict = self._call_mer_service(company, '/apis/v2/send', params=params)
        return response_dict

    def _mer_api_query_inbox(self, company, filter=None, electronic_id=None, status_id=None, date_from=None, date_to=None):
        """
        Status description. Query methods are refered as basic MER document statuses.
        When receiving response from query methods, you will get croatian names of statuses
        (U obradi, Poslan, Preuzet, Povučeno preuzimanje, Neuspjelo).
        """
        params = {
            'Filter': filter,
            'ElectronicId': electronic_id,
            'StatusId': status_id,
            'From': date_from,
            'To': date_to,
        }
        response_list = self._call_mer_service(company, '/apis/v2/queryInbox', params=params)
        return response_list

    def _mer_api_query_outbox(self, company, filter=None, electronic_id=None, status_id=None, invoice_year=None, invoice_number=None, date_from=None, date_to=None):
        """
        Query outbox is used to check the statuses of your sent documents. For this method, the API returns 10.000 results.
        """
        params = {
            'Filter': filter,
            'ElectronicId': electronic_id,
            'StatusId': status_id,
            'InvoiceYear': invoice_year,
            'InvoiceNumber': invoice_number,
            'From': date_from,
            'To': date_to,
        }
        response_list = self._call_mer_service(company, '/apis/v2/queryOutbox', params=params)
        return response_list

    def _mer_api_receive_document(self, company, electronic_id):
        """
        Receive method is used for downloading documents. Both sent and incoming, eg. Inbox and Outbox documents.
        """
        params = {
            'ElectronicId': electronic_id,
        }
        response_bstr = self._call_mer_service(company, '/apis/v2/receive', params=params)
        if response_bstr[:5] != b'<?xml':
            raise MojEracunServiceError('service_error', self.env._("Failed to retrieve document XML for ElectronicId: %s", electronic_id))
        return response_bstr

    def _mer_api_update_document_process_status(self, company, electronic_id, status_id, rejection_reason=None):
        """
        Document process status codes are used to update status of document after it has been
        downloaded or received in the system of the another information provider / access points.
        They are also referred as business document statuses.
        Statuses 4 and 99 cannot be modified via API.
        """
        params = {
            'ElectronicId': electronic_id,
            'StatusId': status_id,
            'RejectReason': rejection_reason,
        }
        response_dict = self._call_mer_service(company, '/apis/v2/UpdateDokumentProcessStatus', params=params)
        return response_dict

    def _mer_api_query_document_process_status_inbox(self, company, electronic_id=None, status_id=None, invoice_year=None, invoice_number=None, date_from=None, date_to=None, by_update_date=None):
        """
        Query inbox is used to discover new documents sent to your company or business unit. For this method, the API returns 20.000 results.
        """
        params = {
            'ElectronicId': electronic_id,
            'StatusId': status_id,
            'InvoiceYear': invoice_year,
            'InvoiceNumber': invoice_number,
            'From': date_from,
            'To': date_to,
            'ByUpdateDate': by_update_date,
        }
        response_list = self._call_mer_service(company, '/apis/v2/queryDocumentProcessStatusInbox', params=params)
        return response_list

    def _mer_api_query_document_process_status_outbox(self, company, electronic_id=None, status_id=None, invoice_year=None, invoice_number=None, date_from=None, date_to=None, by_update_date=None):
        """
        Query inbox is used to discover new documents sent to your company or business unit. For this method, the API returns 20.000 results.
        """
        params = {
            'ElectronicId': electronic_id,
            'StatusId': status_id,
            'InvoiceYear': invoice_year,
            'InvoiceNumber': invoice_number,
            'From': date_from,
            'To': date_to,
            'ByUpdateDate': by_update_date,
        }
        response_list = self._call_mer_service(company, '/apis/v2/queryDocumentProcessStatusOutbox', params=params)
        return response_list

    def _mer_api_notify_import(self, company, electronic_id):
        """
        Notify import method is used for sending an information that an invoice is imported into an ERP.
        You can use it to update which document you have successfully imported and to make procedure for
        importing  only documents that you previously did not download and import.
        """
        response_dict = self._call_mer_service(company, f'/apis/v2/notifyimport/{electronic_id}', params={})
        return response_dict

    def _mer_api_mark_paid(self, company, electronic_id, payment_date, payment_amount, payment_method):
        """
        Methods for sending payment information for sent documents.
        """
        params = {
            'ElectronicId': electronic_id,
            'PaymentDate': payment_date,
            'PaymentAmoung': payment_amount,
            'PaymentMethod': payment_method,
        }
        response_dict = self._call_mer_service(company, '/api/fiscalization/markPaid', params=params)
        return response_dict

    def _mer_api_mark_paid_without_id(self, company, internal_mark, issue_date, sender_id, recipient_id, payment_date, payment_amount, payment_method):
        """
        Methods for sending payment information for sent documents.
        """
        params = {
            'InternalMark': internal_mark,
            'IssueDate': issue_date,
            'SenderIdentifierValue': sender_id,
            'RecipientIdentifierValue': recipient_id,
            'PaymentDate': payment_date,
            'PaymentAmount': payment_amount,
            'PaymentMethod': payment_method,
        }
        response_dict = self._call_mer_service(company, '/api/fiscalization/markPaidWithoutElectronicID', params=params)
        return response_dict

    def _mer_api_reject_with_id(self, company, electronic_id, rejection_date, rejection_type, rejection_desc):
        """
        Methods for sending information regarding rejection for received electronic documents.
        """
        params = {
            'ElectronicId': electronic_id,
            'RejectionDate': rejection_date,
            'RejectionReasonType': rejection_type,
            'RejectionReasonDescription': rejection_desc,
        }
        response_dict = self._call_mer_service(company, '/api/fiscalization/reject', params=params)
        return response_dict

    def _mer_api_reject_without_id(self, company, internal_mark, issue_date, sender_id, recipient_id, rejection_date, rejection_type, rejection_desc):
        """
        Methods for sending information regarding rejection for received electronic documents.
        """
        params = {
            'InternalMark': internal_mark,
            'IssueDate': issue_date,
            'SenderIdentifierValue': sender_id,
            'RecipientIdentifierValue': recipient_id,
            'RejectionDate': rejection_date,
            'RejectionReasonType': rejection_type,
            'RejectionReasonDescription': rejection_desc,
        }
        response_dict = self._call_mer_service(company, '/api/fiscalization/rejectWithoutElectronicID', params=params)
        return response_dict

    def _mer_api_report_operation(self, company, invoice_xml, delivery_date, is_copy, invoice_type):
        """
        Report operation is only used in case of unsuccessful fiscalization using API method SEND.
        When sending document gets rejected from SEND method, you need to create API request for
        sending electronic document to eReporting system of Tax Authority via MER service. After
        you got success response from sending document to this API, you have an option do deliver
        document to the customer in any format and send option (paper, PDF as an attachment to an email)
        """
        params = {
            'xmlInvoice': json.dumps(invoice_xml),
            'DeliveryDate': delivery_date,
            'IsCopy': is_copy,
            'InvoiceType': invoice_type,
        }
        response_dict = self._call_mer_service(company, '/api/fiscalization/eReporting', params=params)
        return response_dict

    def _mer_api_check_id(self, company, id_type, id_value):
        """
        This endpoint checks if a given identifier is registered in the AMS system and returns
        its registration status. If the identifier is found, it returns a 200 OK status;
        otherwise, it returns an appropriate error status.
        """
        params = {
            'IdentifierType': id_type,
            'IdentifierValue': id_value,
        }
        response_dict = self._call_mer_service(company, '/api/mps/check', params=params)
        return response_dict

    def _mer_api_check_fiscalization_status_outbox(self, company, electronic_id=False, message_type=False, date_from=False, date_to=False, request_id=False, status=False):
        """
        This endpoint retrieves the fiscalization status of a document using its ElectronicId and MessageType.
        """
        params = {
            'ElectronicId': electronic_id,
            'MessageType': message_type,
            'DateFrom': date_from,
            'DateTo': date_to,
            'FiscalizationRequestID': request_id,
            'Status': status,
        }
        response_list = self._call_mer_service(company, '/api/fiscalization/statusOutbox', params=params)
        return response_list

    def _mer_api_check_fiscalization_status_inbox(self, company, electronic_id=False, message_type=False, date_from=False, date_to=False, request_id=False, status=False):
        """
        This endpoint retrieves the fiscalization status of a document using its ElectronicId and MessageType.
        """
        params = {
            'ElectronicId': electronic_id,
            'MessageType': message_type,
            'DateFrom': date_from,
            'DateTo': date_to,
            'FiscalizationRequestID': request_id,
            'Status': status,
        }
        response_list = self._call_mer_service(company, '/api/fiscalization/statusInbox', params=params)
        return response_list

    # -------------------------------------------------------------------------
    # BUSINESS ACTIONS
    # -------------------------------------------------------------------------

    # This should be the thing that is run when the user clicks "Deactivate", if we're giving them the option
    def _mer_deregister_participant(self, company):
        if company.l10n_hr_mer_connection_state == 'active':
            # Fetch all documents and message statuses before disabling user so that the invoices are acknowledged
            self._cron_mer_get_new_documents()
            self._cron_mer_update_document_status()
            if not tools.config['test_enable'] and not modules.module.current_test:
                self.env.cr.commit()
        company.l10n_hr_mer_connection_state = 'inactive'

    def _mer_import_invoice(self, company, attachment, document):
        """
        Save new documents in an accounting journal, when one is specified on the company.
        If the document is not an invoice but a rejection notice, log a note on the related move instead.
        :param attachment: the new document
        :param document: a dictionary of MER and fiscalization related values for the document
        :return: `True` if the document was saved, `False` if it was not
        """
        company.ensure_one()
        original_document_id = self.env['account.edi.xml.ubl_hr']._retrieve_rejection_reference(attachment)
        if original_document_id == 'not_found':
            _logger.error("Failed to find origin document for rejection note %s", document['mer_document_eid'])
            return False
        elif original_document_id:
            original_addendum = self.env['l10n_hr_edi.addendum'].search([
                ('mer_document_eid', '=', original_document_id[0]),
                ('business_document_status', '!=', '1')], limit=1)
            if original_addendum:
                original_addendum.move_id.message_post(body=self.env._(
                    "eRacun rejected by document with Electronic ID: %(eid)s\n\"%(reason)s\"",
                    eid=document['mer_document_eid'], reason=original_document_id[1]))
                original_addendum.business_document_status = '1'
            return True
        journal = company.l10n_hr_mer_purchase_journal_id
        if not journal:
            return False

        move = self.env['account.move'].create({
            'state': 'draft',
            'journal_id': journal.id,
            'move_type': 'in_invoice',
        })
        if 'is_in_extractable_state' in move._fields:
            move.is_in_extractable_state = False

        move.l10n_hr_edi_addendum_id = self.env['l10n_hr_edi.addendum'].create({'move_id': move.id, **document})
        move._extend_with_attachments(attachment, new=True)
        move._message_log(
            body=self.env._(
                "eRacun document (ElectroicId: %(electronic_id)s) has been received from MojEracun successfully.",
                electronic_id=document['mer_document_eid'],
            ),
            attachment_ids=attachment.ids,
        )
        attachment.write({'res_model': 'account.move', 'res_id': move.id})
        _logger.info("Successfully imported MER document %s", document['mer_document_eid'])
        return move

    def _mer_get_new_documents(self, companies, undelivered_only=True, slc=False, from_cron=False):
        """
        Import documents from MojEracun. Additional arguments included for testing.
        :param undelivered (bool, optional): Import only undelivered documents. Defaults to True.
        :param notify (bool, optional): Run notify import API after importing. Defaults to True.
        :param slc (tuple of two ints, optional): Import only a slice of the list of documents for testing. Defaults to False.
        """
        job_count = self._context.get('mer_crons_job_count') or BATCH_SIZE
        need_retrigger = False
        imported_documents = {}
        for company in companies:
            try:
                response = self._mer_api_query_inbox(company, 'Undelivered' if undelivered_only else None)
            except MojEracunServiceError as e:
                _logger.error('MojEracun service error: %s', e.message)
                continue

            if any(not (item.get('ElectronicId') and item.get('StatusId')) for item in response):
                _logger.error("MojEracun service error: incorrect response format while querying inbox for company: %s", company.name)
                continue
            documents = [{'mer_document_eid': str(document['ElectronicId']), 'mer_document_status': str(document['StatusId'])} for document in response][::-1]
            if not documents:
                continue

            need_retrigger = need_retrigger or len(documents) > job_count
            documents = documents[:job_count]

            existing_documents = self.env['l10n_hr_edi.addendum'].search([("mer_document_eid", "in", [i['mer_document_eid'] for i in documents])])
            documents_to_import = [i for i in documents if i['mer_document_eid'] not in existing_documents.mapped('mer_document_eid')]
            proxy_acks = []
            # Retrieve attachments for the document IDs received
            if slc:
                documents_to_import = documents_to_import[slc[0]:slc[1]]
            for document in documents_to_import:
                try:
                    fisc_data = self._mer_api_check_fiscalization_status_inbox(company, electronic_id=document['mer_document_eid'])[0]
                except (MojEracunServiceError, UserError):
                    _logger.error("Failed to retreive fisc data for document: %s", document['mer_document_eid'])
                    if from_cron:
                        continue
                    elif company.l10n_hr_mer_connection_mode == 'test':
                        # Bypassing randomness of MER test server responce
                        fisc_data = {'messages': [{
                                'status': '0',
                                'errorCode': None,
                                'errorCodeDescription': 'Nema greške',
                                'fiscalizationRequestId': '00001-test',
                                'businessStatusReason': None,
                            }],
                            'channelType': '0',
                        }
                    else:
                        raise
                document.update({
                    'fiscalization_status': str(fisc_data['messages'][-1].get('status')),
                    'fiscalization_error': str(fisc_data['messages'][-1].get('errorCode')) + ' - ' + str(fisc_data['messages'][-1].get('errorCodeDescription')),
                    'fiscalization_request': str(fisc_data['messages'][-1].get('fiscalizationRequestId')),
                    'business_status_reason': str(fisc_data['messages'][-1].get('businessStatusReason')),
                    'fiscalization_channel_type': str(fisc_data.get('channelType')),
                })
                if document['fiscalization_status'] != '0':
                    continue
                try:
                    business_data = self._mer_api_query_document_process_status_inbox(company, electronic_id=document['mer_document_eid'])[0]
                except (MojEracunServiceError, UserError):
                    _logger.error("Failed to retreive business data for document: %s", document['mer_document_eid'])
                    if from_cron:
                        continue
                    elif company.l10n_hr_mer_connection_mode == 'test':
                        # Bypassing randomness of MER test server responce
                        business_data = {
                            'DocumentProcessStatusId': '0',
                        }
                    else:
                        raise
                document.update({
                    'business_document_status': str(business_data.get('DocumentProcessStatusId')),
                })
                try:
                    document_xml = self._mer_api_receive_document(company, document['mer_document_eid'])
                except MojEracunServiceError as e:
                    _logger.error("Failed to retrieve document: %s", e.message)
                    continue

                attachment = self.env["ir.attachment"].create(
                    {
                        "name": f"mojeracun_{document['mer_document_eid']}_attachment.xml",
                        "raw": document_xml,
                        "type": "binary",
                        "mimetype": "application/xml",
                    }
                )
                if self._mer_import_invoice(company, attachment, document):
                    # Only acknowledge on successful import
                    proxy_acks.append(document['mer_document_eid'])
                if not tools.config['test_enable']:
                    self.env.cr.commit()
                    self._mer_api_notify_import(company, document['mer_document_eid'])

            imported_documents.update({company.id: proxy_acks})
        if need_retrigger:
            self.env.ref('l10n_hr_edi.ir_cron_mer_get_new_documents')._trigger()
        # Return the documents that were successfully imported
        return imported_documents

    def _mer_fetch_document_status_single(self, move):
        """
        Fetch and update the status of a single document on MojEracun.
        """
        move.ensure_one()
        if move.move_type in ("out_invoice", "out_refund"):
            response_mer = self._mer_api_query_document_process_status_outbox(move.company_id, electronic_id=move.l10n_hr_mer_document_eid)[0]
            response_fisc = self._mer_api_check_fiscalization_status_outbox(move.company_id, electronic_id=move.l10n_hr_mer_document_eid)[0]
        elif move.move_type in ("in_invoice", "in_refund"):
            response_mer = self._mer_api_query_document_process_status_inbox(move.company_id, electronic_id=move.l10n_hr_mer_document_eid)[0]
            response_fisc = self._mer_api_check_fiscalization_status_inbox(move.company_id, electronic_id=move.l10n_hr_mer_document_eid)[0]
        else:
            return
        move.l10n_hr_edi_addendum_id.write({
            'mer_document_status': str(response_mer.get('StatusId')),
            'business_document_status': str(response_mer.get('DocumentProcessStatusId')),
            'fiscalization_status': str(response_fisc['messages'][-1].get('status')),
            'fiscalization_error': str(response_fisc['messages'][-1].get('errorCode') + ' - ' + response_fisc['messages'][-1].get('errorCodeDescription')),
            'fiscalization_request': str(response_fisc['messages'][-1].get('fiscalizationRequestId')),
            'business_status_reason': str(response_fisc['messages'][-1].get('businessStatusReason')),
            'fiscalization_channel_type': str(response_fisc.get('channelType')),
        })

    def _mer_fetch_document_status_company(self, companies, from_cron=False):
        """
        Fetch and update the status of up to 20000 documents belonging to a company on MojEracun.
        """
        for company in companies:
            for direction in [
                (self._mer_api_query_document_process_status_outbox, self._mer_api_check_fiscalization_status_outbox),
                (self._mer_api_query_document_process_status_inbox, self._mer_api_check_fiscalization_status_inbox)
            ]:
                response_mer = direction[0](company, by_update_date=True)
                documents = {
                    str(item['ElectronicId']): {
                        'mer_document_status': str(item.get('StatusId')),
                        'business_document_status': str(item.get('DocumentProcessStatusId')),
                    } for item in response_mer
                }
                try:
                    response_fisc = direction[1](company)
                except (MojEracunServiceError, UserError):
                    _logger.error("Failed to retreive fiscalizatio data for company %s", company.name)
                    if from_cron or company.l10n_hr_mer_connection_mode == 'test':
                        response_fisc = []
                    else:
                        raise
                for item in response_fisc:
                    # As we can't fetch all the data with a single query, it's either this or making calls move-by-move
                    # Currently, because of the random nature of responses received from fisc endpoints, this breaks tests
                    if item.get('ElectronicId') in documents:
                        documents[item['ElectronicId']].update({
                            'fiscalization_status': str(item['messages'][-1].get('status')),
                            'fiscalization_error': str(item['messages'][-1].get('errorCode')) + ' - ' + str(item['messages'][-1].get('errorCodeDescription')),
                            'fiscalization_request': str(item['messages'][-1].get('fiscalizationRequestId')),
                            'business_status_reason': str(item['messages'][-1].get('fiscalizationRequestId')),
                            'fiscalization_channel_type': str(item.get('channelType')),
                        })
                addendums = self.env['l10n_hr_edi.addendum'].search([
                    ("mer_document_eid", "in", list(documents.keys())),
                ])
                for addendum in addendums:
                    addendum.write(documents[addendum.mer_document_eid])
