# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api
from odoo.addons.account_edi_extended.models.account_edi_document import DEFAULT_BLOCKING_LEVEL
from psycopg2 import OperationalError
import logging

_logger = logging.getLogger(__name__)


class AccountEdiDocument(models.Model):
    _name = 'account.edi.document'
    _description = 'Electronic Document for an account.move'

    # == Stored fields ==
    move_id = fields.Many2one('account.move', required=True, ondelete='cascade')
    edi_format_id = fields.Many2one('account.edi.format', required=True)
    attachment_id = fields.Many2one('ir.attachment', help='The file generated by edi_format_id when the invoice is posted (and this document is processed).')
    state = fields.Selection([('to_send', 'To Send'), ('sent', 'Sent'), ('to_cancel', 'To Cancel'), ('cancelled', 'Cancelled')])
    error = fields.Html(help='The text of the last error that happened during Electronic Invoice operation.')

    # == Not stored fields ==
    name = fields.Char(related='attachment_id.name')
    edi_format_name = fields.Char(string='Format Name', related='edi_format_id.name')

    _sql_constraints = [
        (
            'unique_edi_document_by_move_by_format',
            'UNIQUE(edi_format_id, move_id)',
            'Only one edi document by move by format',
        ),
    ]

    def write(self, vals):
        ''' If account_edi_extended is not installed, a default behaviour is used instead.
        '''
        if 'blocking_level' in vals and 'blocking_level' not in self.env['account.edi.document']._fields:
            vals.pop('blocking_level')

        return super().write(vals)

    def _check_move_configuration(self):
        # TO OVERRIDE in account_edi_extended. We don't want to block an edi here, so blocking_level is required.
        pass

    def _prepare_jobs(self):
        """Creates a list of jobs to be performed by '_process_job' for the documents in self.
        Each document represent a job, BUT if multiple documents have the same state, edi_format_id,
        doc_type (invoice or payment) and company_id AND the edi_format_id supports batching, they are grouped
        into a single job.

        :returns:         A list of tuples (documents, doc_type)
        * documents:      The documents related to this job. If edi_format_id does not support batch, length is one
        * doc_type:       Are the moves of this job invoice or payments ?
        """

        # Classify jobs by (edi_format, edi_doc.state, doc_type, move.company_id, custom_key)
        to_process = {}
        if 'blocking_level' in self.env['account.edi.document']._fields:
            documents = self.filtered(lambda d: d.state in ('to_send', 'to_cancel') and d.blocking_level != 'error')
        else:
            documents = self.filtered(lambda d: d.state in ('to_send', 'to_cancel'))
        for edi_doc in documents:
            move = edi_doc.move_id
            edi_format = edi_doc.edi_format_id
            if move.is_invoice(include_receipts=True):
                doc_type = 'invoice'
            elif move.payment_id or move.statement_line_id:
                doc_type = 'payment'
            else:
                continue

            custom_key = edi_format._get_batch_key(edi_doc.move_id, edi_doc.state)
            key = (edi_format, edi_doc.state, doc_type, move.company_id, custom_key)
            to_process.setdefault(key, self.env['account.edi.document'])
            to_process[key] |= edi_doc

        # Order payments/invoice and create batches.
        result = []
        payments = []
        for key, documents in to_process.items():
            edi_format, state, doc_type, company_id, custom_key = key
            target = result if doc_type == 'invoice' else payments
            batch = self.env['account.edi.document']
            for doc in documents:
                if edi_format._support_batching(move=doc.move_id, state=state, company=company_id):
                    batch |= doc
                else:
                    target.append((doc, doc_type))
            if batch:
                target.append((batch, doc_type))
        result.extend(payments)
        return result

    @api.model
    def _convert_to_old_jobs_format(self, jobs):
        """ See '_prepare_jobs' :
        Old format : ((edi_format, state, doc_type, company_id), documents)
        Since edi_format, state and company_id can be deduced from documents, this is redundant and more prone to unexpected behaviours.
        New format : (doc_type, documents).

        However, for backward compatibility of 'process_jobs', we need a way to convert back to the old format.
        """
        return [(
            (documents.edi_format_id, documents[0].state, doc_type, documents.move_id.company_id),
            documents
        ) for documents, doc_type in jobs]

    @api.model
    def _process_jobs(self, to_process):
        """ Deprecated, use _process_job instead.

        :param to_process: A list of tuples (key, documents)
        * key:             A tuple (edi_format_id, state, doc_type, company_id)
        ** edi_format_id:  The format to perform the operation with
        ** state:          The state of the documents of this job
        ** doc_type:       Are the moves of this job invoice or payments ?
        ** company_id:     The company the moves belong to
        * documents:       The documents related to this job. If edi_format_id does not support batch, length is one
        """
        for key, documents in to_process:
            edi_format, state, doc_type, company_id = key
            self._process_job(documents, doc_type)

    @api.model
    def _process_job(self, documents, doc_type):
        """Post or cancel move_id (invoice or payment) by calling the related methods on edi_format_id.
        Invoices are processed before payments.

        :param documents: The documents related to this job. If edi_format_id does not support batch, length is one
        :param doc_type:  Are the moves of this job invoice or payments ?
        """
        def _postprocess_post_edi_results(documents, edi_result):
            attachments_to_unlink = self.env['ir.attachment']
            for document in documents:
                move = document.move_id
                move_result = edi_result.get(move, {})
                if move_result.get('attachment'):
                    old_attachment = document.attachment_id
                    values = {
                        'attachment_id': move_result['attachment'].id,
                        'error': move_result.get('error', False),
                        'blocking_level': move_result.get('blocking_level', DEFAULT_BLOCKING_LEVEL) if 'error' in move_result else False,
                    }
                    if not values.get('error'):
                        values.update({'state': 'sent'})
                    document.write(values)
                    if not old_attachment.res_model or not old_attachment.res_id:
                        attachments_to_unlink |= old_attachment
                else:
                    document.write({
                        'error': move_result.get('error', False),
                        'blocking_level': move_result.get('blocking_level', DEFAULT_BLOCKING_LEVEL) if 'error' in move_result else False,
                    })

            # Attachments that are not explicitly linked to a business model could be removed because they are not
            # supposed to have any traceability from the user.
            attachments_to_unlink.unlink()

        def _postprocess_cancel_edi_results(documents, edi_result):
            invoice_ids_to_cancel = set()  # Avoid duplicates
            attachments_to_unlink = self.env['ir.attachment']
            for document in documents:
                move = document.move_id
                move_result = edi_result.get(move, {})
                if move_result.get('success') is True:
                    old_attachment = document.attachment_id
                    document.write({
                        'state': 'cancelled',
                        'error': False,
                        'attachment_id': False,
                        'blocking_level': False,
                    })

                    if move.is_invoice(include_receipts=True) and move.state == 'posted':
                        # The user requested a cancellation of the EDI and it has been approved. Then, the invoice
                        # can be safely cancelled.
                        invoice_ids_to_cancel.add(move.id)

                    if not old_attachment.res_model or not old_attachment.res_id:
                        attachments_to_unlink |= old_attachment

                elif not move_result.get('success'):
                    document.write({
                        'error': move_result.get('error', False),
                        'blocking_level': move_result.get('blocking_level', DEFAULT_BLOCKING_LEVEL) if document.error else False,
                    })

            if invoice_ids_to_cancel:
                invoices = self.env['account.move'].browse(list(invoice_ids_to_cancel))
                invoices.button_draft()
                invoices.button_cancel()

            # Attachments that are not explicitly linked to a business model could be removed because they are not
            # supposed to have any traceability from the user.
            attachments_to_unlink.unlink()

        test_mode = self._context.get('edi_test_mode', False)

        documents.edi_format_id.ensure_one()  # All account.edi.document of a job should have the same edi_format_id
        documents.move_id.company_id.ensure_one()  # All account.edi.document of a job should be from the same company
        if len(set(doc.state for doc in documents)) != 1:
            raise ValueError('All account.edi.document of a job should have the same state')

        edi_format = documents.edi_format_id
        state = documents[0].state
        if doc_type == 'invoice':
            if state == 'to_send':
                edi_result = edi_format._post_invoice_edi(documents.move_id, test_mode=test_mode)
                _postprocess_post_edi_results(documents, edi_result)
            elif state == 'to_cancel':
                edi_result = edi_format._cancel_invoice_edi(documents.move_id, test_mode=test_mode)
                _postprocess_cancel_edi_results(documents, edi_result)

        elif doc_type == 'payment':
            if state == 'to_send':
                edi_result = edi_format._post_payment_edi(documents.move_id, test_mode=test_mode)
                _postprocess_post_edi_results(documents, edi_result)
            elif state == 'to_cancel':
                edi_result = edi_format._cancel_payment_edi(documents.move_id, test_mode=test_mode)
                _postprocess_cancel_edi_results(documents, edi_result)

    def _process_documents_no_web_services(self):
        """ Post and cancel all the documents that don't need a web service.
        """
        jobs = self.filtered(lambda d: not d.edi_format_id._needs_web_services())._prepare_jobs()
        self._process_jobs(self._convert_to_old_jobs_format(jobs))

    def _process_documents_web_services(self, job_count=None, with_commit=True):
        """ Post and cancel all the documents that need a web service. This is called by CRON.

        :param job_count: Limit to the number of jobs to process among the ones that are available for treatment.
        """
        jobs = self.filtered(lambda d: d.edi_format_id._needs_web_services())._prepare_jobs()
        jobs = jobs[0:job_count or len(jobs)]
        for documents, doc_type in jobs:
            try:
                with self.env.cr.savepoint():
                    self._cr.execute('SELECT * FROM account_edi_document WHERE id IN %s FOR UPDATE NOWAIT', [tuple(self.ids)])
                    self._process_job(documents, doc_type)
            except OperationalError as e:
                if e.pgcode == '55P03':
                    _logger.debug('Another transaction already locked documents rows. Cannot process documents.')
                else:
                    raise e
            else:
                if with_commit and len(jobs) > 1:
                    self.env.cr.commit()
