from odoo import _, api, fields, models
from odoo.exceptions import UserError


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_es_edi_verifactu_required = fields.Boolean(
        string="Veri*Factu Required",
        compute='_compute_l10n_es_edi_verifactu_required',
    )
    l10n_es_edi_verifactu_document_ids = fields.One2many(
        comodel_name='l10n_es_edi_verifactu.document',
        inverse_name='move_id',
        string="Veri*Factu Documents",
    )
    l10n_es_edi_verifactu_state = fields.Selection(
        string="Veri*Factu Status",
        selection=[
            ('rejected', "Rejected"),
            ('registered_with_errors', "Registered with Errors"),
            ('accepted', "Accepted"),
            ('cancelled', "Cancelled"),
        ],
        compute='_compute_l10n_es_edi_verifactu_state', store=True,
        tracking=True,
        help="""- Rejected: Successfully sent to the AEAT, but it was rejected during validation
                - Registered with Errors: Registered at the AEAT, but the AEAT has some issues with the sent document
                - Accepted: Registered by the AEAT without errors
                - Cancelled: Registered by the AEAT as cancelled""",
    )
    l10n_es_edi_verifactu_error_level = fields.Selection(
        string="Veri*Factu Error Level",
        selection=[
            ('rejected', "Rejected"),
            ('registered_with_errors', "Registered with Errors"),
        ],
        compute="_compute_l10n_es_edi_verifactu_errors_and_error_level"
    )
    l10n_es_edi_verifactu_errors = fields.Html(
        string="Veri*Factu Errors",
        compute="_compute_l10n_es_edi_verifactu_errors_and_error_level"
    )
    l10n_es_edi_verifactu_qr_code = fields.Char(
        string="Veri*Factu QR Code",
        compute='_compute_l10n_es_edi_verifactu_qr_code',
        help="This QR code is mandatory for Veri*Factu invoices.",
    )
    l10n_es_edi_verifactu_show_cancel_button = fields.Boolean(
        string="Show Veri*Factu Cancel Button",
        compute='_compute_l10n_es_edi_verifactu_show_cancel_button',
    )

    @api.depends('country_code')
    def _compute_l10n_es_edi_verifactu_required(self):
        for move in self:
            move.l10n_es_edi_verifactu_required = move.country_code == 'ES' and move.company_id.l10n_es_edi_verifactu_required

    @api.depends('l10n_es_edi_verifactu_document_ids', 'l10n_es_edi_verifactu_document_ids.state', 'l10n_es_edi_verifactu_document_ids.errors')
    def _compute_l10n_es_edi_verifactu_errors_and_error_level(self):
        for move in self:
            last_document = move.l10n_es_edi_verifactu_document_ids.sorted()[:1]
            error_level = False if last_document.state == 'accepted' else last_document.state
            move.l10n_es_edi_verifactu_error_level = error_level
            move.l10n_es_edi_verifactu_errors = last_document.errors

    @api.depends('l10n_es_edi_verifactu_document_ids', 'l10n_es_edi_verifactu_document_ids.state')
    def _compute_l10n_es_edi_verifactu_state(self):
        for move in self:
            state = self.l10n_es_edi_verifactu_document_ids._get_state()
            move.l10n_es_edi_verifactu_state = state

    @api.depends('l10n_es_edi_verifactu_document_ids', 'l10n_es_edi_verifactu_document_ids.record_identifier')
    def _compute_l10n_es_edi_verifactu_qr_code(self):
        for move in self:
            url = move.l10n_es_edi_verifactu_document_ids._get_last('submission')._get_qr_code_img_url()
            move.l10n_es_edi_verifactu_qr_code = url

    @api.depends('l10n_es_edi_verifactu_state')
    def _compute_l10n_es_edi_verifactu_show_cancel_button(self):
        for move in self:
            move.l10n_es_edi_verifactu_show_cancel_button = move.l10n_es_edi_verifactu_state in ('registered_with_errors', 'accepted')

    @api.depends('l10n_es_edi_verifactu_state', 'l10n_es_edi_verifactu_document_ids', 'l10n_es_edi_verifactu_document_ids.state')
    def _compute_show_reset_to_draft_button(self):
        """
        Disallow resetting to draft in the following cases:
        * The move is known to the AEAT (registered or cancelled)
        * We are waiting to sent a document (submission) to the AEAT
        """
        # EXTENDS 'account'
        super()._compute_show_reset_to_draft_button()
        for move in self:
            if move.l10n_es_edi_verifactu_state:
                move.show_reset_to_draft_button = False
                continue
            waiting_documents = move.l10n_es_edi_verifactu_document_ids._filter_waiting()
            if waiting_documents:
                move.show_reset_to_draft_button = False

    def l10n_es_edi_verifactu_button_cancel(self):
        created_documents = self._l10n_es_edi_verifactu_mark_for_next_batch(cancellation=True)
        skipped_moves = self.filtered(lambda move: not created_documents.get(move))
        if skipped_moves and len(self) == 1:
            # TODO: not correct in case we skip for concurrency case
            raise UserError(_("We are waiting to send a Veri*Factu record to the AEAT already."))
        # In other cases we just silently skip them

    def _l10n_es_edi_verifactu_check(self, cancellation=False):
        self.ensure_one()
        errors = []

        if self.state != 'posted':
            errors.append(_("The journal entry has to be posted."))

        refunded_move = self.reversed_entry_id
        refunded_document = refunded_move.l10n_es_edi_verifactu_document_ids._get_last('submission')
        if refunded_move and not refunded_document:
            # TODO: could also be cancellation without prior registration
            errors.append(_("The refunded journal entry has no Veri*Factu document yet."))

        return errors

    def _l10n_es_edi_verifactu_get_record_values(self, cancellation=False):
        self.ensure_one()

        errors = self._l10n_es_edi_verifactu_check(cancellation=cancellation)
        if errors:
            return {'errors': errors}


        company = self.company_id
        documents = self.l10n_es_edi_verifactu_document_ids
        document_type = 'cancellation' if cancellation else 'submission'
        # Just checking whether the last document was rejected is enough; we do not allow to submit the same record
        # again after a cancellation (else we get the error '[3000] Registro de facturación duplicado.').
        rejected_before = documents._get_last(document_type).state == 'rejected'
        is_simplified = self.l10n_es_is_simplified

        vals = {
            'cancellation': cancellation,
            'record': self,
            'rejected_before': rejected_before,
            'verifactu_state': self.l10n_es_edi_verifactu_state,
            'company': company,
            'delivery_date': self.delivery_date,
            'description': self.invoice_origin[:500] if self.invoice_origin else None,
            'invoice_date': self.invoice_date,
            'is_simplified': is_simplified,
            'move_type': self.move_type,
            'name': self.name,
            'partner': self.commercial_partner_id,
            'refunded_document': self.reversed_entry_id.l10n_es_edi_verifactu_document_ids._get_last('submission'),
            'documents': documents,
        }

        tax_details_functions = self.env['account.tax']._l10n_es_edi_verifactu_get_tax_details_functions(
            company, simplified_invoice=is_simplified
        )

        vals['tax_details'] = self._prepare_invoice_aggregated_taxes(
            filter_invl_to_apply=tax_details_functions['full_filter_invl_to_apply'],
            filter_tax_values_to_apply=tax_details_functions['filter_to_apply'],
            grouping_key_generator=tax_details_functions['grouping_key_generator'],
        )

        vals['document_vals'] = {
            'move_id': self.id,
            'company_id': company.id,
            'document_type': document_type,
        }

        vals['errors'] = self.env['l10n_es_edi_verifactu.document']._check_record_values(vals)

        return vals

    def _l10n_es_edi_verifactu_create_document(self, cancellation=False, previous_record_identifier=None):
        self.ensure_one()

        record_values = self._l10n_es_edi_verifactu_get_record_values(cancellation=cancellation)

        return self.env['l10n_es_edi_verifactu.document']._create_for_record(
            record_values, previous_record_identifier=previous_record_identifier,
        )

    def _l10n_es_edi_verifactu_mark_for_next_batch(self, cancellation=False):
        record_values_list = [
            move._l10n_es_edi_verifactu_get_record_values(cancellation=cancellation)
            for move in self
        ]
        return self.env['l10n_es_edi_verifactu.document']._mark_records_for_next_batch(record_values_list)
