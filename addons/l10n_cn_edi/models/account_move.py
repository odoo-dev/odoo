# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging

from odoo import api, fields, models
from odoo.exceptions import UserError

from .l10n_cn_edi_document import (
    BUREAU_STATES,
    BUREAU_STATES_CONFIRMED,
    RED_FORM_REASONS,
)
from odoo.addons.phone_validation.tools.phone_validation import phone_format

INVOICE_TYPE_CODES = [
    ('01', '01 Digital Special Invoice (数电专票)'),
    ('02', '02 Digital General Invoice (数电普票)'),
]

EDI_STATES = [
    ('not_sent', 'Not Sent'),
    ('waiting_login', 'Waiting for Login'),
    ('sent', 'Sent'),
    ('issued', 'Issued'),
    ('failed', 'Failed'),
]

_logger = logging.getLogger(__name__)

# The bureau's 发票行性质: shared by every provider.
LINE_NORMAL, LINE_DISCOUNT, LINE_DISCOUNTED = '0', '1', '2'


class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_cn_edi_state = fields.Selection(
        selection=EDI_STATES,
        string="E-Fapiao Status",
        default='not_sent',
        copy=False,
    )
    l10n_cn_edi_invoice_type_code = fields.Selection(
        selection=INVOICE_TYPE_CODES,
        string="Fapiao Type",
        default='02',
        required=True,
        help="Type of e-Fapiao to issue: '01' for special (专票) or '02' for general (普票).",
    )
    l10n_cn_edi_fapiao_no = fields.Char(string="Fapiao No.", copy=False, index='btree_not_null')
    l10n_cn_edi_fapiao_date = fields.Datetime(string="Fapiao Date", copy=False)
    l10n_cn_edi_serial_no = fields.Char(
        string="Serial No",
        copy=False,
        readonly=True,
        help="Request serial number sent to the provider; reusing it makes a retry idempotent.",
    )
    l10n_cn_edi_qr_code = fields.Char(string="Fapiao QR Code", copy=False, readonly=True)
    l10n_cn_edi_fapiao_pdf_id = fields.Many2one(
        comodel_name='ir.attachment',
        string="Fapiao PDF",
        copy=False,
        readonly=True,
    )
    l10n_cn_edi_fapiao_ofd_id = fields.Many2one(
        comodel_name='ir.attachment',
        string="Fapiao OFD",
        copy=False,
        readonly=True,
        help="The legal original of the e-Fapiao. The PDF is a copy for reading and emailing.",
    )
    l10n_cn_edi_red_form_reason = fields.Selection(
        selection=RED_FORM_REASONS,
        string="Red Form Reason",
        compute='_compute_l10n_cn_edi_red_form_reason',
        store=True,
        readonly=False,
    )
    l10n_cn_edi_document_ids = fields.One2many(
        comodel_name='l10n_cn_edi.document',
        inverse_name='move_id',
        string="Red Forms",
    )
    l10n_cn_edi_is_needed = fields.Boolean(compute='_compute_l10n_cn_edi_is_needed')
    l10n_cn_edi_red_form_required = fields.Boolean(compute='_compute_l10n_cn_edi_red_form_required')
    l10n_cn_edi_date_warning = fields.Char(
        string="Date Consistency Warning",
        compute='_compute_l10n_cn_edi_date_warning',
    )
    l10n_cn_buyer_bank_id = fields.Many2one(
        comodel_name='res.partner.bank',
        string="Customer Bank Account",
        compute='_compute_l10n_cn_buyer_bank_id',
        store=True,
        readonly=False,
        domain="[('partner_id', '=', partner_id)]",
        help="The customer's bank account to be printed on the e-Fapiao.",
    )
    l10n_cn_edi_red_form_uuid = fields.Char(
        string="Red Form UUID",
        compute='_compute_l10n_cn_edi_latest_red_form',
        compute_sudo=True,
    )
    l10n_cn_edi_red_form_number = fields.Char(
        string="Red Form Number",
        compute='_compute_l10n_cn_edi_latest_red_form',
        compute_sudo=True,
    )
    l10n_cn_edi_red_form_status = fields.Selection(
        selection=[
            ('draft', 'Draft'),
            ('red_form_pending', 'Red Form Pending'),
            ('red_form_confirmed', 'Red Form Confirmed'),
            ('failed', 'Failed'),
        ],
        string="Red Form Status",
        compute='_compute_l10n_cn_edi_latest_red_form',
        compute_sudo=True,
    )
    l10n_cn_edi_red_form_bureau_state = fields.Selection(
        selection=BUREAU_STATES,
        string="Red Form Tax Bureau State",
        compute='_compute_l10n_cn_edi_latest_red_form',
        compute_sudo=True,
    )
    l10n_cn_edi_red_form_amount_untaxed = fields.Float(
        string="Inbound Credit Price",
        compute='_compute_l10n_cn_edi_latest_red_form',
        compute_sudo=True,
    )
    l10n_cn_edi_red_form_amount_tax = fields.Float(
        string="Inbound Credit Tax",
        compute='_compute_l10n_cn_edi_latest_red_form',
        compute_sudo=True,
    )

    # ------------------------------------------------------------------
    # Computes
    # ------------------------------------------------------------------

    @api.depends('l10n_cn_edi_red_form_required', 'l10n_cn_edi_red_form_status')
    def _compute_hide_post_button(self):
        super()._compute_hide_post_button()
        for move in self:
            if move.l10n_cn_edi_red_form_required and move.l10n_cn_edi_red_form_status != 'red_form_confirmed':
                move.hide_post_button = True

    @api.depends('l10n_cn_edi_document_ids.red_form_reason', 'l10n_cn_edi_document_ids.state')
    def _compute_l10n_cn_edi_red_form_reason(self):
        for move in self:
            latest_doc = move.l10n_cn_edi_document_ids.filtered(
                lambda doc: doc.state != 'failed',
            ).sorted('create_date', reverse=True)[:1]
            move.l10n_cn_edi_red_form_reason = latest_doc.red_form_reason

    @api.depends('country_code', 'move_type', 'state', 'l10n_cn_edi_state')
    def _compute_l10n_cn_edi_is_needed(self):
        for move in self:
            move.l10n_cn_edi_is_needed = (
                move.country_code == 'CN'
                and move.move_type in ('out_invoice', 'out_refund')
                and move.state == 'posted'
                and move.l10n_cn_edi_state not in ('issued', 'sent')
            )

    @api.depends('country_code', 'move_type', 'state', 'l10n_cn_edi_state', 'reversed_entry_id.l10n_cn_edi_fapiao_no')
    def _compute_l10n_cn_edi_red_form_required(self):
        for move in self:
            move.l10n_cn_edi_red_form_required = bool(
                move.country_code == 'CN'
                and move.move_type == 'out_refund'
                and move.state == 'draft'
                and move.reversed_entry_id.l10n_cn_edi_fapiao_no
                # A credit note of a red form the customer raised already carries its red fapiao.
                and move.l10n_cn_edi_state != 'issued',
            )

    @api.depends('invoice_date', 'l10n_cn_edi_fapiao_date', 'l10n_cn_edi_fapiao_no', 'state', 'move_type')
    def _compute_l10n_cn_edi_date_warning(self):
        for move in self:
            move.l10n_cn_edi_date_warning = False
            if (
                move.move_type == 'out_refund'
                and move.state == 'draft'
                and move.l10n_cn_edi_fapiao_no
                and move.invoice_date
                and move.l10n_cn_edi_fapiao_date
                and move.invoice_date != move.l10n_cn_edi_fapiao_date.date()
            ):
                move.l10n_cn_edi_date_warning = self.env._(
                    "Invoice Date is different from Fapiao Date. Please be aware of the consistency "
                    "between E-fapiao Date and Odoo Invoice Date.",
                )

    @api.depends('partner_id')
    def _compute_l10n_cn_buyer_bank_id(self):
        for move in self:
            move.l10n_cn_buyer_bank_id = move.partner_id.bank_ids[:1]

    @api.depends(
        'l10n_cn_edi_document_ids.state',
        'l10n_cn_edi_document_ids.bureau_state',
        'l10n_cn_edi_document_ids.red_form_uuid',
        'l10n_cn_edi_document_ids.red_form_number',
        'l10n_cn_edi_document_ids.amount_untaxed',
        'l10n_cn_edi_document_ids.amount_tax',
    )
    def _compute_l10n_cn_edi_latest_red_form(self):
        for move in self:
            latest = move.l10n_cn_edi_document_ids.sorted('create_date', reverse=True)[:1]
            move.l10n_cn_edi_red_form_uuid = latest.red_form_uuid
            move.l10n_cn_edi_red_form_number = latest.red_form_number
            move.l10n_cn_edi_red_form_status = latest.state
            move.l10n_cn_edi_red_form_bureau_state = latest.bureau_state
            move.l10n_cn_edi_red_form_amount_untaxed = latest.amount_untaxed
            move.l10n_cn_edi_red_form_amount_tax = latest.amount_tax

    # ------------------------------------------------------------------
    # CRUD and lifecycle guards
    # ------------------------------------------------------------------

    @api.ondelete(at_uninstall=False)
    def _unlink_except_active_red_forms(self):
        for move in self:
            if any(doc.state in ('red_form_pending', 'red_form_confirmed') for doc in move.l10n_cn_edi_document_ids):
                raise UserError(self.env._("Cannot delete a record with a pending or confirmed Red Form."))

    def button_cancel(self):
        # EXTENDS 'account'
        if any(move.l10n_cn_edi_state in ('sent', 'issued') for move in self):
            raise UserError(self.env._("You cannot cancel a document whose e-Fapiao is pending or already issued."))
        return super().button_cancel()

    def button_draft(self):
        # EXTENDS 'account'
        if any(move.l10n_cn_edi_state in ('sent', 'issued') for move in self):
            raise UserError(self.env._(
                "You cannot reset this invoice to draft because its e-Fapiao has already been sent. "
                "You must issue a Red Form (Credit Note) to reverse it.",
            ))
        return super().button_draft()

    def _reverse_moves(self, default_values_list=None, cancel=False):
        # EXTENDS 'account'
        # The credit note of a red form the other party raised carries that red fapiao.
        reversals = super()._reverse_moves(default_values_list=default_values_list, cancel=cancel)
        for move, reversal in zip(self, reversals):
            if move.move_type in ('in_invoice', 'out_invoice') and move.l10n_cn_edi_red_form_status in ('red_form_pending', 'red_form_confirmed'):
                doc = move.l10n_cn_edi_document_ids.filtered(lambda d: d.red_form_uuid == move.l10n_cn_edi_red_form_uuid)[:1]
                if doc.red_fapiao_no:
                    reversal.write({
                        'l10n_cn_edi_fapiao_no': doc.red_fapiao_no,
                        'l10n_cn_edi_state': 'issued',
                        'l10n_cn_edi_red_form_reason': doc.red_form_reason,
                    })
        return reversals

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def action_l10n_cn_edi_request_red_form(self):
        """Request a red letter confirmation form for a draft credit note of an issued invoice."""
        self.ensure_one()
        if self.move_type != 'out_refund':
            raise UserError(self.env._("Red Form can only be requested for Credit Notes."))
        if self.state != 'draft':
            raise UserError(self.env._("Credit Note must be in draft before requesting a Red Form."))
        # Read before touching the documents: they drive the reason's compute.
        reason = self.l10n_cn_edi_red_form_reason
        if not reason:
            raise UserError(self.env._("Please select a Red Form Reason before requesting."))
        if self.l10n_cn_edi_state in ('sent', 'issued'):
            raise UserError(self.env._("Cannot request a Red Form for an invoice in 'sent' or 'issued' state."))
        original_move = self.reversed_entry_id
        if not original_move.l10n_cn_edi_fapiao_no:
            raise UserError(self.env._("Cannot find the original fapiao number. Ensure this credit note was created from an issued e-Fapiao."))
        if self.currency_id.compare_amounts(self.amount_total, original_move.amount_total):
            raise UserError(self.env._(
                "A red fapiao can only reverse the whole fapiao %(fapiao)s (%(amount)s). "
                "Credit the full amount, then issue a new invoice with the right amounts.",
                fapiao=original_move.l10n_cn_edi_fapiao_no,
                amount=original_move.amount_total,
            ))
        client = self.company_id._l10n_cn_edi_get_client()
        client.ensure_ready()
        doc = self.l10n_cn_edi_document_ids[:1]
        if doc.state == 'red_form_pending':
            raise UserError(self.env._("A Red Form request is already pending for this Credit Note."))
        if doc.state == 'red_form_confirmed':
            raise UserError(self.env._("A Red Form has already been confirmed for this Credit Note."))
        doc_vals = {'state': 'draft', 'error_message': False, 'red_form_reason': reason}
        if doc:
            doc.write(doc_vals)
        else:
            doc = self.env['l10n_cn_edi.document'].create({**doc_vals, 'move_id': self.id})
        self.l10n_cn_edi_serial_no = self.l10n_cn_edi_serial_no or f"RED_{self.id}_{fields.Datetime.now():%Y%m%d%H%M%S}"
        try:
            result = client.request_red_form(self._l10n_cn_edi_prepare_red_form_values(original_move))
        except UserError as e:
            doc.write({'state': 'failed', 'error_message': str(e)})
            self.l10n_cn_edi_state = 'failed'
            self.message_post(body=self.env._("Red Form request failed: %s", e))
            return
        if not result.get('bureau_state') and (result.get('error') or not result.get('uuid')):
            error = result.get('error') or self.env._("The provider returned no red form.")
            doc.write({'state': 'failed', 'error_message': error})
            self.l10n_cn_edi_state = 'failed'
            self.message_post(body=self.env._("Red Form rejected: %s", error))
            return
        doc.write({'red_form_uuid': result['uuid'], 'state': 'red_form_pending'})
        doc._l10n_cn_edi_apply_red_form_result(result)
        if result.get('bureau_state') in BUREAU_STATES_CONFIRMED:
            self.message_post(body=self.env._("Red Form confirmed (auto-approved). No: %s", doc.red_form_number))

    def action_l10n_cn_edi_cancel_red_form(self):
        """Withdraw a pending red form raised from this credit note."""
        self.ensure_one()
        doc = self.l10n_cn_edi_document_ids.sorted('create_date', reverse=True)[:1]
        if doc.state != 'red_form_pending':
            return
        try:
            self.company_id._l10n_cn_edi_get_client().operate_red_form(doc, 'revoke')
        except UserError as e:
            raise UserError(self.env._("Failed to revoke the Red Form: %s", e))
        doc.write({
            'state': 'failed',
            'bureau_state': '08',
            'error_message': self.env._("Revoked and cancelled by user."),
        })
        self.l10n_cn_edi_red_form_reason = False
        self.message_post(body=self.env._("Red Form request revoked and cancelled by user. You may request a new one."))

    def action_l10n_cn_edi_login(self):
        """Log the drawer back in to the tax bureau, then send this invoice again."""
        self.ensure_one()
        return self.company_id._l10n_cn_edi_action_login(self)

    def action_l10n_cn_edi_approve_inbound_red_form(self):
        """Approve a red form the other party raised against this vendor bill or invoice."""
        self.ensure_one()
        doc = self.l10n_cn_edi_document_ids.filtered(lambda d: d.state == 'red_form_pending')[:1]
        if not doc:
            return
        try:
            self.company_id._l10n_cn_edi_get_client().operate_red_form(doc, 'confirm')
        except UserError as e:
            raise UserError(self.env._("Failed to approve the Red Form: %s", e))
        # The bureau issues the red fapiao now; the cron picks up its number.
        doc._l10n_cn_edi_apply_red_form_result({'bureau_state': '04'})
        self.message_post(body=self.env._("Inbound Red Form approved. The tax bureau now issues the red fapiao."))

    def action_l10n_cn_edi_reject_inbound_red_form(self):
        """Refuse a red form the other party raised against this vendor bill or invoice."""
        self.ensure_one()
        doc = self.l10n_cn_edi_document_ids.filtered(lambda d: d.state == 'red_form_pending')[:1]
        if not doc:
            return
        try:
            self.company_id._l10n_cn_edi_get_client().operate_red_form(doc, 'reject')
        except UserError as e:
            raise UserError(self.env._("Failed to reject the Red Form: %s", e))
        # 05: the buyer refused the seller's form; 06: the seller refused the buyer's.
        bureau_state = '06' if self.move_type == 'out_invoice' else '05'
        doc.write({'state': 'failed', 'bureau_state': bureau_state, 'error_message': self.env._("Rejected by user.")})
        self.message_post(body=self.env._("Inbound Red Form %s rejected.", doc.red_form_number))

    # ------------------------------------------------------------------
    # Blue fapiao issuance
    # ------------------------------------------------------------------

    def _l10n_cn_edi_submit_invoice(self, client):
        """Submit the e-Fapiao of this customer invoice. Return an error message, or None."""
        self.ensure_one()
        self.l10n_cn_edi_serial_no = self.l10n_cn_edi_serial_no or f"BLUE_{self.id}_{fields.Datetime.now():%Y%m%d%H%M%S}"
        try:
            result = client.issue_invoice(self._l10n_cn_edi_prepare_invoice_values())
        except UserError as e:
            # Connectivity or configuration: leave the invoice retryable.
            return str(e)
        return self._l10n_cn_edi_apply_invoice_result(result)

    def _l10n_cn_edi_fetch_submitted(self, client):
        """Follow up on fapiao just submitted, once per delay of the client; the cron takes over after.

        Return ``{move: error message}`` for those that failed meanwhile.
        """
        errors = {}
        for delay in client.result_delays:
            pending = self.filtered(lambda move: move.l10n_cn_edi_state == 'sent')
            if not pending:
                break
            client.wait(delay)
            for move in pending:
                try:
                    result = client.query_invoice(move, just_submitted=True)
                except UserError as e:
                    _logger.warning("E-Fapiao: could not follow up on invoice %s: %s", move.name, e)
                    continue
                if error := move._l10n_cn_edi_apply_invoice_result(result):
                    errors[move] = error
        return errors

    def _l10n_cn_edi_apply_invoice_result(self, result):
        """Record an invoice result from the provider. Return an error message, or None."""
        self.ensure_one()
        if result.get('state') == 'issued':
            vals = {
                'l10n_cn_edi_state': 'issued',
                'l10n_cn_edi_fapiao_no': result.get('fapiao_no'),
                'l10n_cn_edi_fapiao_date': result.get('fapiao_date'),
                'l10n_cn_edi_qr_code': result.get('qr_code'),
            }
            self.write(vals)
            self.message_post(
                body=self.env._("E-Fapiao issued successfully. Invoice No: %s", result.get('fapiao_no')),
                attachment_ids=self._l10n_cn_edi_attach_fapiao_files(result, result.get('fapiao_no')).ids,
            )
            return None
        if result.get('state') == 'sent':
            self.l10n_cn_edi_state = 'sent'
            self.env.ref('l10n_cn_edi.ir_cron_l10n_cn_edi_poll_invoices')._trigger()
            return None
        error = result.get('error') or self.env._("Unexpected response from the e-Fapiao provider.")
        self.l10n_cn_edi_state = 'failed'
        if result.get('new_serial'):
            self.l10n_cn_edi_serial_no = False
        self.message_post(body=error)
        return error

    def _l10n_cn_edi_attach_fapiao_files(self, result, fapiao_no):
        """Attach the PDF and OFD of a provider result to this move. Return the attachments."""
        self.ensure_one()
        attachments = self.env['ir.attachment']
        for kind, mimetype in (('pdf', 'application/pdf'), ('ofd', 'application/ofd')):
            if result.get(kind):
                attachment = self.env['ir.attachment'].create({
                    'name': result.get(f'{kind}_filename') or f"{fapiao_no}.{kind}",
                    'raw': result[kind],
                    'mimetype': mimetype,
                    'res_model': self._name,
                    'res_id': self.id,
                })
                self[f'l10n_cn_edi_fapiao_{kind}_id'] = attachment
                attachments += attachment
        return attachments

    @api.model
    def _cron_l10n_cn_edi_poll_invoices(self):
        """Fetch the result of every fapiao the provider accepted but hadn't finished issuing."""
        moves = self.search([('l10n_cn_edi_state', '=', 'sent')])
        for company, company_moves in moves.grouped('company_id').items():
            if not company._l10n_cn_edi_is_ready():
                continue
            client = company._l10n_cn_edi_get_client()
            for move in company_moves:
                try:
                    with self.env.cr.savepoint():
                        move._l10n_cn_edi_apply_invoice_result(client.query_invoice(move))
                except UserError as e:
                    _logger.warning("E-Fapiao: could not poll invoice %s: %s", move.name, e)

    def _l10n_cn_edi_prepare_invoice_values(self):
        """The provider-neutral content of this invoice's fapiao (see tools/client.py)."""
        self.ensure_one()
        partner = self.partner_id
        remark = str(self.narration) if self.narration else ''
        buyer_phone = False
        if partner.phone:
            formatted_phone = phone_format(
                partner.phone,
                partner.country_id.code,
                partner.country_id.phone_code,
                force_format='E164',
                raise_exception=False,
            ) or ''
            if formatted_phone.startswith('+86'):
                buyer_phone = formatted_phone[3:]
            else:
                # The fapiao only has room for a mainland number; keep the others readable in the remark.
                remark = f"{remark} | Phone: {partner.phone}".strip(' |')
        bank = self.l10n_cn_buyer_bank_id
        return {
            'serial_no': self.l10n_cn_edi_serial_no,
            'invoice_type_code': self.l10n_cn_edi_invoice_type_code or '02',
            'buyer_name': partner.name or '',
            'buyer_tax_no': partner.vat or '',
            'buyer_is_natural_person': not partner.vat,
            'buyer_address': ' '.join(filter(None, [partner.street, partner.street2, partner.city])),
            'buyer_phone': buyer_phone,
            'buyer_email': partner.email or '',
            # The fapiao prints bank and account on one line (开户行及账号).
            'buyer_bank': f"{bank.bank_name or ''} {bank.account_number or ''}".strip(),
            'drawer': self.company_id.l10n_cn_edi_drawer or self.env.user.name,
            'remark': remark,
            'amount_untaxed': round(sum(self._l10n_cn_edi_product_lines().mapped('price_subtotal')), 2),
            'amount_tax': round(self.amount_tax, 2),
            'amount_total': round(self.amount_total, 2),
            'lines': self._l10n_cn_edi_prepare_lines(),
        }

    def _l10n_cn_edi_product_lines(self):
        return self.invoice_line_ids.filtered(lambda line: line.display_type == 'product')

    def _l10n_cn_edi_prepare_lines(self):
        """Fapiao lines, with negative lines spread proportionally over the others as discount lines.

        The bureau has no negative line: a discount is a 折扣行 (nature '1') right after the
        被折扣行 (nature '2') it reduces.
        """
        product_lines = self._l10n_cn_edi_product_lines()
        positive_lines = product_lines.filtered(lambda line: line.price_subtotal >= 0)
        negative_lines = product_lines - positive_lines
        total_discount = sum(negative_lines.mapped('price_subtotal'))
        total_discount_tax = sum(line.price_total - line.price_subtotal for line in negative_lines)
        total_positive = sum(positive_lines.mapped('price_subtotal'))
        remaining_discount, remaining_discount_tax = total_discount, total_discount_tax
        lines = []
        for index, line in enumerate(positive_lines):
            if not line.l10n_cn_tax_category_id:
                raise UserError(self.env._("Missing Tax Category Code on line: %s", line.name))
            amount = round(line.price_subtotal, 2)
            tax = round(line.price_total - line.price_subtotal, 2)
            tax_rate = round(tax / amount, 2) if amount else 0.0
            discount, discount_tax = 0.0, 0.0
            if total_discount < 0 and total_positive > 0:
                if index == len(positive_lines) - 1:
                    discount, discount_tax = round(remaining_discount, 2), round(remaining_discount_tax, 2)
                else:
                    ratio = amount / total_positive
                    discount, discount_tax = round(total_discount * ratio, 2), round(total_discount_tax * ratio, 2)
                    remaining_discount -= discount
                    remaining_discount_tax -= discount_tax
            if line.discount:
                factor = line.discount / 100.0
                gross, gross_tax = round(amount / (1.0 - factor), 2), round(tax / (1.0 - factor), 2)
                discount += amount - gross
                discount_tax += tax - gross_tax
                amount, tax = gross, gross_tax
            is_discounted = discount < 0
            tax_record = line.tax_ids[:1]
            line_values = {
                'price_include': tax_record.price_include,
                'line_no': len(lines) + 1,
                'nature': LINE_DISCOUNTED if is_discounted else LINE_NORMAL,
                'name': (line.name or line.product_id.name or '').replace('\n', ' ')[:100],
                'tax_category_code': line.l10n_cn_tax_category_id.code,
                'tax_rate': abs(tax_rate),
                'amount_untaxed': amount,
                'amount_tax': tax,
                'amount_total': round(amount + tax, 2),
                'quantity': line.quantity or False,
                'unit_price': round(amount / line.quantity, 8) if line.quantity else round(line.price_unit, 8),
                'uom': line.product_uom_id.name or '',
                'vat_special_policy': tax_record.l10n_cn_vat_special_policy or False,
                'free_tax_mark': tax_record.l10n_cn_free_tax_mark or False,
                'reduced_tax_code': tax_record.l10n_cn_reduced_tax_code or False,
            }
            lines.append(line_values)
            if is_discounted:
                lines.append({
                    **line_values,
                    'line_no': len(lines) + 1,
                    'nature': LINE_DISCOUNT,
                    'amount_untaxed': round(discount, 2),
                    'amount_tax': round(discount_tax, 2),
                    'amount_total': round(discount + discount_tax, 2),
                    'quantity': False,
                    'unit_price': False,
                    'uom': '',
                })
        return lines

    # ------------------------------------------------------------------
    # Red forms
    # ------------------------------------------------------------------

    def _l10n_cn_edi_prepare_red_form_values(self, original_move):
        """The provider-neutral content of this credit note's red form (see tools/client.py)."""
        self.ensure_one()
        return {
            'serial_no': self.l10n_cn_edi_serial_no,
            'reason': self.l10n_cn_edi_red_form_reason,
            'seller_name': self.company_id.name,
            'buyer_name': self.partner_id.name or '',
            'buyer_tax_no': self.partner_id.vat or '',
            'buyer_email': self.partner_id.email or '',
            'original_fapiao_no': original_move.l10n_cn_edi_fapiao_no,
            'original_fapiao_date': original_move.l10n_cn_edi_fapiao_date or original_move.invoice_date,
            'original_invoice_type_code': original_move.l10n_cn_edi_invoice_type_code,
            'original_amount_untaxed': round(sum(original_move._l10n_cn_edi_product_lines().mapped('price_subtotal')), 2),
            'original_amount_tax': round(original_move.amount_tax, 2),
            'amount_untaxed': -abs(round(sum(self._l10n_cn_edi_product_lines().mapped('price_subtotal')), 2)),
            'amount_tax': -abs(round(self.amount_tax, 2)),
            'lines': self._l10n_cn_edi_prepare_red_form_lines(),
        }

    def _l10n_cn_edi_prepare_red_form_lines(self):
        """Red form lines: discounts netted into the line they reduce, every amount negative.

        ``original_line_no`` points at the line of the original fapiao being credited, which
        assumes the credit note keeps the original invoice's line order.
        """
        red_lines = []
        for line in self._l10n_cn_edi_prepare_lines():
            if line['nature'] == LINE_DISCOUNT:
                parent = red_lines[-1]
                parent['amount_untaxed'] = round(parent['amount_untaxed'] + line['amount_untaxed'], 2)
                parent['amount_tax'] = round(parent['amount_tax'] + line['amount_tax'], 2)
                parent['amount_total'] = round(parent['amount_total'] + line['amount_total'], 2)
                parent['nature'] = LINE_NORMAL
                continue
            red_lines.append({**line, 'original_line_no': line['line_no']})
        for line in red_lines:
            line['amount_untaxed'] = -abs(line['amount_untaxed'])
            line['amount_tax'] = -abs(line['amount_tax'])
            line['amount_total'] = -abs(line['amount_total'])
            if line['quantity']:
                line['quantity'] = -abs(line['quantity'])
        return red_lines
