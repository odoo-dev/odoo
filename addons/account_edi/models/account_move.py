# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import io
import zipfile
from werkzeug.urls import url_encode

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class AccountMove(models.Model):
    _inherit = 'account.move'

    edi_document_ids = fields.One2many(
        comodel_name='account.edi.document',
        inverse_name='move_id')
    edi_state = fields.Selection(
        selection=[('to_send', 'To Send'), ('sent', 'Sent'), ('to_cancel', 'To Cancel'), ('cancelled', 'Cancelled')],
        string="Electronic invoicing",
        store=True,
        compute='_compute_edi_state',
        help='The aggregated state of all the EDIs with web-service of this move')
    edi_error_count = fields.Integer(
        compute='_compute_edi_error_count',
        help='How many EDIs are in error for this move?')
    edi_blocking_level = fields.Selection(
        selection=[('info', 'Info'), ('warning', 'Warning'), ('error', 'Error')],
        compute='_compute_edi_error_message')
    edi_error_message = fields.Html(
        compute='_compute_edi_error_message')
    # Technical field to display the documents that will be processed by the CRON
    edi_web_services_to_process = fields.Text(
        compute='_compute_edi_web_services_to_process')
    edi_show_cancel_button = fields.Boolean(
        compute='_compute_edi_show_cancel_button')
    edi_show_abandon_cancel_button = fields.Boolean(
        compute='_compute_edi_show_abandon_cancel_button')

    @api.depends('edi_document_ids.state')
    def _compute_edi_state(self):
        for move in self:
            all_states = set(move.edi_document_ids.filtered(lambda d: d.edi_format_id._needs_web_services()).mapped('state'))
            if all_states == {'sent'}:
                move.edi_state = 'sent'
            elif all_states == {'cancelled'}:
                move.edi_state = 'cancelled'
            elif 'to_send' in all_states:
                move.edi_state = 'to_send'
            elif 'to_cancel' in all_states:
                move.edi_state = 'to_cancel'
            else:
                move.edi_state = False

    @api.depends('edi_document_ids.error')
    def _compute_edi_error_count(self):
        for move in self:
            move.edi_error_count = len(move.edi_document_ids.filtered(lambda d: d.error))

    @api.depends('edi_error_count', 'edi_document_ids.error', 'edi_document_ids.blocking_level')
    def _compute_edi_error_message(self):
        for move in self:
            if move.edi_error_count == 0:
                move.edi_error_message = None
                move.edi_blocking_level = None
            elif move.edi_error_count == 1:
                error_doc = move.edi_document_ids.filtered(lambda d: d.error)
                move.edi_error_message = error_doc.error
                move.edi_blocking_level = error_doc.blocking_level
            else:
                error_levels = set([doc.blocking_level for doc in move.edi_document_ids])
                if 'error' in error_levels:
                    move.edi_error_message = str(move.edi_error_count) + _(" Electronic invoicing error(s)")
                    move.edi_blocking_level = 'error'
                elif 'warning' in error_levels:
                    move.edi_error_message = str(move.edi_error_count) + _(" Electronic invoicing warning(s)")
                    move.edi_blocking_level = 'warning'
                else:
                    move.edi_error_message = str(move.edi_error_count) + _(" Electronic invoicing info(s)")
                    move.edi_blocking_level = 'info'

    @api.depends(
        'edi_document_ids',
        'edi_document_ids.state',
        'edi_document_ids.blocking_level',
        'edi_document_ids.edi_format_id',
        'edi_document_ids.edi_format_id.name')
    def _compute_edi_web_services_to_process(self):
        for move in self:
            to_process = move.edi_document_ids.filtered(lambda d: d.state in ['to_send', 'to_cancel'] and d.blocking_level != 'error')
            format_web_services = to_process.edi_format_id.filtered(lambda f: f._needs_web_services())
            move.edi_web_services_to_process = ', '.join(f.name for f in format_web_services)

    @api.depends('edi_document_ids.state')
    def _compute_show_reset_to_draft_button(self):
        # OVERRIDE
        super()._compute_show_reset_to_draft_button()

        for move in self:
            for doc in move.edi_document_ids:
                move_applicability = doc.edi_format_id._get_move_applicability(move)
                if doc.edi_format_id._needs_web_services() \
                    and doc.state in ('sent', 'to_cancel') \
                    and move_applicability \
                    and move_applicability.get('cancel'):
                    move.show_reset_to_draft_button = False
                    break

    @api.depends('edi_document_ids.state')
    def _compute_edi_show_cancel_button(self):
        for move in self:
            if move.state != 'posted':
                move.edi_show_cancel_button = False
                continue

            move.edi_show_cancel_button = False
            for doc in move.edi_document_ids:
                move_applicability = doc.edi_format_id._get_move_applicability(move)
                if doc.edi_format_id._needs_web_services() \
                    and doc.state == 'sent' \
                    and move_applicability \
                    and move_applicability.get('cancel'):
                    move.edi_show_cancel_button = True
                    break

    @api.depends('edi_document_ids.state')
    def _compute_edi_show_abandon_cancel_button(self):
        for move in self:
            move.edi_show_abandon_cancel_button = False
            for doc in move.sudo().edi_document_ids:
                move_applicability = doc.edi_format_id._get_move_applicability(move)
                if doc.edi_format_id._needs_web_services() \
                    and doc.state == 'to_cancel' \
                    and move_applicability \
                    and move_applicability.get('cancel'):
                    move.edi_show_abandon_cancel_button = True
                    break

    ####################################################
    # Export Electronic Document
    ####################################################

    def _prepare_edi_tax_details(self, filter_to_apply=None, filter_invl_to_apply=None, grouping_key_generator=None):
        ''' Compute amounts related to taxes for the current invoice.

        :param filter_to_apply:         Optional filter to exclude some tax values from the final results.
                                        The filter is defined as a method getting a dictionary as parameter
                                        representing the tax values for a single repartition line.
                                        This dictionary contains:

            'base_line_id':             An account.move.line record.
            'tax_id':                   An account.tax record.
            'tax_repartition_line_id':  An account.tax.repartition.line record.
            'base_amount':              The tax base amount expressed in company currency.
            'tax_amount':               The tax amount expressed in company currency.
            'base_amount_currency':     The tax base amount expressed in foreign currency.
            'tax_amount_currency':      The tax amount expressed in foreign currency.

                                        If the filter is returning False, it means the current tax values will be
                                        ignored when computing the final results.

        :param filter_invl_to_apply:    Optional filter to exclude some invoice lines.

        :param grouping_key_generator:  Optional method used to group tax values together. By default, the tax values
                                        are grouped by tax. This parameter is a method getting a dictionary as parameter
                                        (same signature as 'filter_to_apply').

                                        This method must returns a dictionary where values will be used to create the
                                        grouping_key to aggregate tax values together. The returned dictionary is added
                                        to each tax details in order to retrieve the full grouping_key later.

        :param compute_mode:            Optional parameter to specify the method used to allocate the tax line amounts
                                        among the invoice lines:
                                        'tax_details' (the default) uses the AccountMove._get_query_tax_details method.
                                        'compute_all' uses the AccountTax._compute_all method.

                                        The 'tax_details' method takes the tax line balance and allocates it among the
                                        invoice lines to which that tax applies, proportionately to the invoice lines'
                                        base amounts. This always ensures that the sum of the tax amounts equals the
                                        tax line's balance, which, depending on the constraints of a particular
                                        localization, can be more appropriate when 'Round Globally' is set.

                                        The 'compute_all' method returns, for each invoice line, the exact tax amounts
                                        corresponding to the taxes applied to the invoice line. Depending on the
                                        constraints of the particular localization, this can be more appropriate when
                                        'Round per Line' is set.

        :return:                        The full tax details for the current invoice and for each invoice line
                                        separately. The returned dictionary is the following:

            'base_amount':              The total tax base amount in company currency for the whole invoice.
            'tax_amount':               The total tax amount in company currency for the whole invoice.
            'base_amount_currency':     The total tax base amount in foreign currency for the whole invoice.
            'tax_amount_currency':      The total tax amount in foreign currency for the whole invoice.
            'tax_details':              A mapping of each grouping key (see 'grouping_key_generator') to a dictionary
                                        containing:

                'base_amount':              The tax base amount in company currency for the current group.
                'tax_amount':               The tax amount in company currency for the current group.
                'base_amount_currency':     The tax base amount in foreign currency for the current group.
                'tax_amount_currency':      The tax amount in foreign currency for the current group.
                'group_tax_details':        The list of all tax values aggregated into this group.

            'tax_details_per_record': A mapping of each invoice line to a dictionary containing:

                'base_amount':          The total tax base amount in company currency for the whole invoice line.
                'tax_amount':           The total tax amount in company currency for the whole invoice line.
                'base_amount_currency': The total tax base amount in foreign currency for the whole invoice line.
                'tax_amount_currency':  The total tax amount in foreign currency for the whole invoice line.
                'tax_details':          A mapping of each grouping key (see 'grouping_key_generator') to a dictionary
                                        containing:

                    'base_amount':          The tax base amount in company currency for the current group.
                    'tax_amount':           The tax amount in company currency for the current group.
                    'base_amount_currency': The tax base amount in foreign currency for the current group.
                    'tax_amount_currency':  The tax amount in foreign currency for the current group.
                    'group_tax_details':    The list of all tax values aggregated into this group.

        '''
        return self._prepare_invoice_aggregated_taxes(
            filter_invl_to_apply=filter_invl_to_apply,
            filter_tax_values_to_apply=filter_to_apply,
            grouping_key_generator=grouping_key_generator,
        )

<<<<<<< HEAD
||||||| parent of f722e8580103 (temp)
    def _update_payments_edi_documents(self):
        ''' Update the edi documents linked to the current journal entries. These journal entries must be linked to an
        account.payment of an account.bank.statement.line. This additional method is needed because the payment flow is
        not the same as the invoice one. Indeed, the edi documents must be updated when the reconciliation with some
        invoices is changing.
        '''
        edi_document_vals_list = []
        to_remove = self.env['account.edi.document']
        for payment in self:
            edi_formats = payment._get_reconciled_invoices().journal_id.edi_format_ids | payment.edi_document_ids.edi_format_id
            for edi_format in edi_formats:
                existing_edi_document = payment.edi_document_ids.filtered(lambda x: x.edi_format_id == edi_format)
                move_applicability = edi_format._get_move_applicability(payment)

                if move_applicability:
                    if existing_edi_document:
                        existing_edi_document.write({
                            'state': 'to_send',
                            'error': False,
                            'blocking_level': False,
                        })
                    else:
                        edi_document_vals_list.append({
                            'edi_format_id': edi_format.id,
                            'move_id': payment.id,
                            'state': 'to_send',
                        })
                elif existing_edi_document:
                    to_remove |= existing_edi_document

        to_remove.unlink()
        self.env['account.edi.document'].create(edi_document_vals_list)
        self.edi_document_ids._process_documents_no_web_services()

=======
    def _update_payments_edi_documents(self):
        ''' Update the edi documents linked to the current journal entries. These journal entries must be linked to an
        account.payment of an account.bank.statement.line. This additional method is needed because the payment flow is
        not the same as the invoice one. Indeed, the edi documents must be created when the payment is fully reconciled
        with invoices.
        '''
        payments = self.filtered(lambda move: move.payment_id or move.statement_line_id)
        edi_document_vals_list = []
        to_remove = self.env['account.edi.document']
        for payment in payments:
            edi_formats = payment._get_reconciled_invoices().journal_id.edi_format_ids | payment.edi_document_ids.edi_format_id
            for edi_format in edi_formats:
                # Only recreate document when cancelled before.
                existing_edi_document = payment.edi_document_ids.filtered(lambda x: x.edi_format_id == edi_format)
                if existing_edi_document.state == 'sent':
                    continue
                move_applicability = edi_format._get_move_applicability(payment)

                if move_applicability:
                    if existing_edi_document:
                        existing_edi_document.write({
                            'state': 'to_send',
                            'error': False,
                            'blocking_level': False,
                        })
                    else:
                        edi_document_vals_list.append({
                            'edi_format_id': edi_format.id,
                            'move_id': payment.id,
                            'state': 'to_send',
                        })
                elif existing_edi_document:
                    to_remove |= existing_edi_document

        to_remove.unlink()
        self.env['account.edi.document'].create(edi_document_vals_list)
        self.edi_document_ids._process_documents_no_web_services()

>>>>>>> f722e8580103 (temp)
    def _is_ready_to_be_sent(self):
        # OVERRIDE
        # Prevent a mail to be sent to the customer if the EDI document is not sent.
        res = super()._is_ready_to_be_sent()

        if not res:
            return False

        edi_documents_to_send = self.edi_document_ids.filtered(lambda x: x.state == 'to_send')
        return not bool(edi_documents_to_send)

    def _post(self, soft=True):
        # OVERRIDE
        # Set the electronic document to be posted and post immediately for synchronous formats.
        posted = super()._post(soft=soft)

        edi_document_vals_list = []
        for move in posted:
            for edi_format in move.journal_id.edi_format_ids:
                move_applicability = edi_format._get_move_applicability(move)

                if move_applicability:
                    errors = edi_format._check_move_configuration(move)
                    if errors:
                        raise UserError(_("Invalid invoice configuration:\n\n%s") % '\n'.join(errors))

                    existing_edi_document = move.edi_document_ids.filtered(lambda x: x.edi_format_id == edi_format)
                    if existing_edi_document:
                        existing_edi_document.sudo().write({
                            'state': 'to_send',
                            'attachment_id': False,
                        })
                    else:
                        edi_document_vals_list.append({
                            'edi_format_id': edi_format.id,
                            'move_id': move.id,
                            'state': 'to_send',
                        })

        self.env['account.edi.document'].create(edi_document_vals_list)
        posted.edi_document_ids._process_documents_no_web_services()
        self.env.ref('account_edi.ir_cron_edi_network')._trigger()
        return posted

    def button_cancel(self):
        # OVERRIDE
        # Set the electronic document to be canceled and cancel immediately for synchronous formats.
        res = super().button_cancel()

        self.edi_document_ids.filtered(lambda doc: doc.state != 'sent').write({'state': 'cancelled', 'error': False, 'blocking_level': False})
        self.edi_document_ids.filtered(lambda doc: doc.state == 'sent').write({'state': 'to_cancel', 'error': False, 'blocking_level': False})
        self.edi_document_ids._process_documents_no_web_services()
        self.env.ref('account_edi.ir_cron_edi_network')._trigger()

        return res

    def button_draft(self):
        # OVERRIDE
        for move in self:
            if move.edi_show_cancel_button:
                raise UserError(_(
                    "You can't edit the following journal entry %s because an electronic document has already been "
                    "sent. Please use the 'Request EDI Cancellation' button instead."
                ) % move.display_name)

        res = super().button_draft()

        self.edi_document_ids.write({'error': False, 'blocking_level': False})
        self.edi_document_ids.filtered(lambda doc: doc.state == 'to_send').unlink()

        return res

    def button_cancel_posted_moves(self):
        '''Mark the edi.document related to this move to be canceled.
        '''
        to_cancel_documents = self.env['account.edi.document']
        for move in self:
            move._check_fiscalyear_lock_date()
            is_move_marked = False
            for doc in move.edi_document_ids:
                move_applicability = doc.edi_format_id._get_move_applicability(move)
                if doc.edi_format_id._needs_web_services() \
                        and doc.state == 'sent' \
                        and move_applicability \
                        and move_applicability.get('cancel'):
                    to_cancel_documents |= doc
                    is_move_marked = True
            if is_move_marked:
                move.message_post(body=_("A cancellation of the EDI has been requested."))

        to_cancel_documents.write({'state': 'to_cancel', 'error': False, 'blocking_level': False})

    def button_abandon_cancel_posted_posted_moves(self):
        '''Cancel the request for cancellation of the EDI.
        '''
        documents = self.env['account.edi.document']
        for move in self:
            is_move_marked = False
            for doc in move.edi_document_ids:
                move_applicability = doc.edi_format_id._get_move_applicability(move)
                if doc.state == 'to_cancel' and move_applicability and move_applicability.get('cancel'):
                    documents |= doc
                    is_move_marked = True
            if is_move_marked:
                move.message_post(body=_("A request for cancellation of the EDI has been called off."))

        documents.write({'state': 'sent'})

    def _get_edi_document(self, edi_format):
        return self.edi_document_ids.filtered(lambda d: d.edi_format_id == edi_format)

    def _get_edi_attachment(self, edi_format):
        return self._get_edi_document(edi_format).sudo().attachment_id

    # this override is to make sure that the main attachment is not the edi xml otherwise the attachment viewer will not work correctly
    def _message_set_main_attachment_id(self, attachment_ids):
        if self.message_main_attachment_id and len(attachment_ids) > 1 and self.message_main_attachment_id in self.edi_document_ids.attachment_id:
            self.message_main_attachment_id = self.env['ir.attachment']
        super()._message_set_main_attachment_id(attachment_ids)

    ####################################################
    # Business operations
    ####################################################

    def button_process_edi_web_services(self):
        self.action_process_edi_web_services(with_commit=False)

    def action_process_edi_web_services(self, with_commit=True):
        docs = self.edi_document_ids.filtered(lambda d: d.state in ('to_send', 'to_cancel') and d.blocking_level != 'error')
        docs._process_documents_web_services(with_commit=with_commit)

    def _retry_edi_documents_error_hook(self):
        ''' Hook called when edi_documents are retried. For example, when it's needed to clean a field.
        TO OVERRIDE
        '''
        return

    def action_retry_edi_documents_error(self):
        self._retry_edi_documents_error_hook()
        self.edi_document_ids.write({'error': False, 'blocking_level': False})
        self.action_process_edi_web_services()

    ####################################################
    # Mailing
    ####################################################

    def _process_attachments_for_template_post(self, mail_template):
        """ Add Edi attachments to templates. """
        result = super()._process_attachments_for_template_post(mail_template)
        for move in self.filtered('edi_document_ids'):
            move_result = result.setdefault(move.id, {})
            for edi_doc in move.edi_document_ids:
                edi_attachments = edi_doc._filter_edi_attachments_for_mailing()
                move_result.setdefault('attachment_ids', []).extend(edi_attachments.get('attachment_ids', []))
                move_result.setdefault('attachments', []).extend(edi_attachments.get('attachments', []))
        return result

    ####################################################
    # Export Electronic Document
    ####################################################
    def _action_download_electronic_invoice(self):
        # To be removed in master
        if not self:
            return False
        return {
            'type': 'ir.actions.act_url',
            'url': '/account_edi/download_edi_documents?%s' % url_encode({'ids': self.ids}),
            'target': 'new',
        }

    def _create_zipped(self):
        # To be removed in master
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zipfile_obj:
            for invoice in self:
                for document in invoice.edi_document_ids:
                    if document.state in {'sent', 'cancelled'}:
                        zipfile_obj.writestr(document.display_name, document.attachment_id.raw)
        return buffer.getvalue()

    def _get_edi_doc_attachments_to_export(self):
        # EXTENDS 'account'
        return super()._get_edi_doc_attachments_to_export() + self.edi_document_ids.attachment_id
<<<<<<< HEAD
||||||| parent of f722e8580103 (temp)


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    ####################################################
    # Export Electronic Document
    ####################################################

    def _reconcile_pre_hook(self):
        # EXTENDS 'account'
        # In some countries, the payments must be sent to the government under some condition. One of them could be
        # there is at least one reconciled invoice to the payment. Then, we need to update the state of the edi
        # documents during the reconciliation.
        results = super()._reconcile_pre_hook()
        all_lines = self + self.matched_debit_ids.debit_move_id + self.matched_credit_ids.credit_move_id
        results['edi_payments'] = all_lines.move_id\
            .filtered(lambda move: move.payment_id or move.statement_line_id)
        results['edi_invoices_per_payment_before'] = {
            pay: pay._get_reconciled_invoices()
            for pay in results['edi_payments']
        }
        return results

    def _reconcile_post_hook(self, data):
        # EXTENDS 'account'
        super()._reconcile_post_hook(data)
        payments = data['edi_payments']

        changed_payments = self.env['account.move']
        for payment in payments:
            amls = payment.line_ids.filtered(lambda x: x.account_id.account_type == 'asset_receivable')
            if all(amls.mapped('reconciled')):
                matched_invoices = payment._get_reconciled_invoices()
                if all(inv.edi_state == 'sent' for inv in matched_invoices):
                    changed_payments |= payment
        changed_payments._update_payments_edi_documents()
=======


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    ####################################################
    # Export Electronic Document
    ####################################################

    def _reconcile_post_hook(self, data):
        # EXTENDS 'account'
        results = super()._reconcile_post_hook(data)
        all_lines = self + self.matched_debit_ids.debit_move_id + self.matched_credit_ids.credit_move_id
        all_lines.move_id._update_payments_edi_documents()
        return results
>>>>>>> f722e8580103 (temp)
