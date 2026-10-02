# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

RED_FORM_REASONS = [
    ('01', '01 Invoice Error (开票有误)'),
    ('02', '02 Sales Return (销货退回)'),
    ('03', '03 Service Termination (服务中止)'),
    ('04', '04 Sales Discount (销售折让)'),
]

# The tax bureau's own red form states: every provider passes these through unchanged.
BUREAU_STATES = [
    ('01', '01 No Confirmation Needed (无需确认)'),
    ('02', '02 Seller Entered, Awaiting Buyer (销方录入待购方确认)'),
    ('03', '03 Buyer Entered, Awaiting Seller (购方录入待销方确认)'),
    ('04', '04 Confirmed by Both Parties (购销双方已确认)'),
    ('05', '05 Void: Buyer Refused (作废（销方录入购方否认）)'),
    ('06', '06 Void: Seller Refused (作废（购方录入销方否认）)'),
    ('07', '07 Void: Not Confirmed Within 72 Hours (作废（超72小时未确认）)'),
    ('08', '08 Void: Withdrawn by Initiator (作废（发起方已撤销）)'),
    ('09', '09 Void: Withdrawn After Confirmation (作废（确认后撤销）)'),
    ('10', '10 Void: Abnormal Voucher (作废（异常凭证）)'),
]
BUREAU_STATES_CONFIRMED = {'01', '04'}
BUREAU_STATES_PENDING = {'02', '03'}
RED_FORM_ACTIVE_STATES = ('red_form_pending', 'red_form_confirmed')


class L10nCnEdiDocument(models.Model):
    _name = 'l10n_cn_edi.document'
    _description = 'E-Fapiao Red Form'
    _order = 'id desc'

    move_id = fields.Many2one('account.move', string="Journal Entry", required=True, index=True, ondelete='cascade')
    state = fields.Selection([
        ('draft', 'Draft'),
        ('red_form_pending', 'Pending Confirmation'),
        ('red_form_confirmed', 'Confirmed'),
        ('failed', 'Failed/Rejected'),
    ], default='draft', required=True)

    red_form_uuid = fields.Char(string="Red Form UUID", copy=False, index='btree_not_null')
    red_form_number = fields.Char(string="Red Form Number", copy=False)
    bureau_state = fields.Selection(selection=BUREAU_STATES, string="Tax Bureau State", copy=False)
    red_fapiao_no = fields.Char(string="Red Fapiao Number", copy=False)
    amount_untaxed = fields.Float(string="Credit Price", copy=False)
    amount_tax = fields.Float(string="Credit Tax", copy=False)
    red_form_reason = fields.Selection(selection=RED_FORM_REASONS, string="Red Form Reason", copy=False)
    error_message = fields.Text(string="Error Details")

    def _l10n_cn_edi_check_action_role(self, action):
        self.ensure_one()
        move = self.move_id
        if self.state != 'red_form_pending':
            raise UserError(self.env._("Only pending Red Forms can be processed."))
        self.check_access('write')
        if action == 'revoke' and move.move_type != 'out_refund':
            raise UserError(self.env._("Only seller credit notes can revoke a Red Form request."))
        if action == 'revoke' and move.state != 'draft':
            raise UserError(self.env._("Only draft seller credit notes can revoke a Red Form request."))
        if action in ('confirm', 'reject') and move.move_type not in ('in_invoice', 'out_invoice'):
            raise UserError(self.env._("Only posted bills/invoices can confirm or reject inbound Red Forms."))
        if action in ('confirm', 'reject') and move.state != 'posted':
            raise UserError(self.env._("Only posted bills/invoices can confirm or reject inbound Red Forms."))
        if action in ('confirm', 'reject') and self.bureau_state not in BUREAU_STATES_PENDING:
            raise UserError(self.env._("This Red Form is no longer waiting for confirmation."))

    @api.model
    def _l10n_cn_edi_state_from_bureau(self, bureau_state, red_fapiao_no):
        if bureau_state in BUREAU_STATES_CONFIRMED:
            # In 数电 the bureau issues the red fapiao once the form is confirmed: until
            # it's out, the credit note has no number to carry, so keep polling.
            return 'red_form_confirmed' if red_fapiao_no else 'red_form_pending'
        if bureau_state in BUREAU_STATES_PENDING:
            return 'red_form_pending'
        return 'failed'

    @api.model
    def _cron_check_red_form_status(self):
        """Poll the provider for red forms still pending confirmation, and pull inbound ones."""
        self._l10n_cn_edi_pull_inbound_red_forms()
        pending_docs = self.search([
            ('state', '=', 'red_form_pending'),
            ('red_form_uuid', '!=', False),
        ])
        self.env['ir.cron']._commit_progress(remaining=len(pending_docs))
        for company, docs in pending_docs.grouped(lambda doc: doc.move_id.company_id).items():
            try:
                if not company._l10n_cn_edi_is_ready():
                    continue
                client = company._l10n_cn_edi_get_client()
            except UserError as e:
                _logger.warning("E-Fapiao: could not poll the red forms of company %s: %s", company.name, e)
                continue
            for doc in docs:
                try:
                    with self.env.cr.savepoint():
                        doc._l10n_cn_edi_apply_red_form_result(client.query_red_form(doc))
                except UserError as e:
                    _logger.warning("E-Fapiao: could not poll red form %s: %s", doc.red_form_uuid, e)
                if not self.env['ir.cron']._commit_progress(1):
                    return

    def _l10n_cn_edi_apply_red_form_result(self, result):
        """Record a red form result on this document and on the move it belongs to."""
        self.ensure_one()
        bureau_state = result.get('bureau_state')
        if not bureau_state:
            if result.get('error'):
                self.write({'state': 'failed', 'error_message': result['error']})
                if self.move_id.move_type == 'out_refund':
                    self.move_id.l10n_cn_edi_state = 'failed'
                self.move_id.message_post(body=self.env._("Red Form rejected: %s", result['error']))
            # Otherwise the bureau hasn't registered the form yet: still pending.
            return
        move = self.move_id
        red_fapiao_no = result.get('red_fapiao_no') or self.red_fapiao_no
        state = self._l10n_cn_edi_state_from_bureau(bureau_state, red_fapiao_no)
        was_state = self.state
        self.write({
            'state': state,
            'bureau_state': bureau_state,
            'red_form_number': result.get('number') or self.red_form_number,
            'red_fapiao_no': red_fapiao_no,
            'error_message': result.get('error') if state == 'failed' else False,
        })
        if state == was_state:
            return
        if state == 'red_form_confirmed':
            if move.move_type == 'out_refund':
                vals = {'l10n_cn_edi_state': 'issued'}
                if red_fapiao_no:
                    vals['l10n_cn_edi_fapiao_no'] = red_fapiao_no
                if result.get('red_fapiao_date'):
                    vals['l10n_cn_edi_fapiao_date'] = result['red_fapiao_date']
                move.write(vals)
                move._l10n_cn_edi_attach_fapiao_files(result, red_fapiao_no)
                move.activity_schedule(
                    'mail.mail_activity_data_todo',
                    summary=self.env._("Red Form has been approved and Red Fapiao has been issued, Please confirm Credit Note in Odoo accordingly"),
                    user_id=move.create_uid.id,
                )
            else:
                move.activity_schedule(
                    'mail.mail_activity_data_todo',
                    summary=self.env._("Inbound Red Form %s approved and issued. Please ensure a matching Credit Note is posted.", self.red_form_number),
                    user_id=move.create_uid.id,
                )
        elif state == 'failed':
            if move.move_type == 'out_refund':
                # The form is void at the bureau: a new request needs a new serial.
                move.l10n_cn_edi_state = 'failed'
                move._l10n_cn_edi_drop_serial()
            move.message_post(body=self.env._(
                "Red Form rejected/cancelled. Tax bureau state: %(state)s",
                state=dict(BUREAU_STATES).get(bureau_state, bureau_state),
            ))

    @api.model
    def _l10n_cn_edi_pull_inbound_red_forms(self):
        """Poll for red forms raised by suppliers, using a sliding catch-up window."""
        # A company's country isn't stored, and a database holds a handful of companies at most.
        companies = self.env['res.company'].search([]).filtered(
            lambda company: company.country_code == 'CN' and company._l10n_cn_edi_is_ready(),
        )
        today = fields.Date.context_today(self)
        for company in companies:
            # Keep a monotonically progressing watermark per company.
            start_date = company.l10n_cn_edi_inbound_red_form_last_date or (today - timedelta(days=30))
            end_date = min(start_date + timedelta(days=30), today)
            try:
                with self.env.cr.savepoint():
                    self._l10n_cn_edi_import_inbound_red_forms(company, start_date, end_date)
                    company.sudo().l10n_cn_edi_inbound_red_form_last_date = end_date
            except UserError as e:
                _logger.warning("E-Fapiao: could not pull inbound red forms for company %s: %s", company.name, e)
            self.env['ir.cron']._commit_progress()

    @api.model
    def _l10n_cn_edi_import_inbound_red_forms(self, company, start_date, end_date):
        """Track the red forms the other party raised against our fapiao, and tell whoever has to act.

        A supplier's form lands on the vendor bill it reverses, a customer's on the invoice.
        """
        forms = company._l10n_cn_edi_get_client().list_inbound_red_forms(start_date, end_date)
        forms = [
            form for form in forms
            if form.get('uuid') and form.get('bureau_state') in BUREAU_STATES_CONFIRMED | BUREAU_STATES_PENDING
        ]
        if not forms:
            return
        known_uuids = set(self.search([('red_form_uuid', 'in', [form['uuid'] for form in forms])]).mapped('red_form_uuid'))
        bills = self.env['account.move'].search([
            ('l10n_cn_edi_fapiao_no', 'in', [form.get('original_fapiao_no') for form in forms]),
            ('company_id', '=', company.id),
            ('move_type', 'in', ('in_invoice', 'out_invoice')),
        ])
        bill_by_fapiao_no = {bill.l10n_cn_edi_fapiao_no: bill for bill in bills}
        vals_list = []
        for form in forms:
            if form['uuid'] in known_uuids:
                continue
            bill = bill_by_fapiao_no.get(form.get('original_fapiao_no'))
            if not bill:
                _logger.info(
                    "E-Fapiao: inbound red form %s refers to fapiao %s, which matches no invoice or bill of %s",
                    form.get('number'), form.get('original_fapiao_no'), company.name,
                )
                continue
            vals_list.append({
                'move_id': bill.id,
                'state': self._l10n_cn_edi_state_from_bureau(form['bureau_state'], form.get('red_fapiao_no')),
                'red_form_uuid': form['uuid'],
                'red_form_number': form.get('number'),
                'red_fapiao_no': form.get('red_fapiao_no'),
                'bureau_state': form['bureau_state'],
                'amount_untaxed': form.get('amount_untaxed') or 0.0,
                'amount_tax': form.get('amount_tax') or 0.0,
                'red_form_reason': form.get('reason'),
            })
        for doc in self.create(vals_list):
            if doc.state == 'red_form_pending':
                summary = self.env._(
                    "Inbound Red Form %(number)s requires approval (Price: %(price)s, Tax: %(tax)s)",
                    number=doc.red_form_number,
                    price=doc.amount_untaxed,
                    tax=doc.amount_tax,
                )
            else:
                summary = self.env._("Inbound Red Form %s is approved/issued. Please draft Credit Note.", doc.red_form_number)
            doc.move_id.activity_schedule(
                'mail.mail_activity_data_todo',
                summary=summary,
                user_id=doc.move_id.create_uid.id,
            )
