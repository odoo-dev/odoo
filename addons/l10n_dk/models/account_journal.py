import re

from odoo import Command, api, fields, models
from odoo.exceptions import ValidationError

L10N_DK_FIK_MODELS = ('dk_fik_71', 'dk_fik_75')


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    invoice_reference_model = fields.Selection(
        selection_add=[
            ('dk_fik_71', "Denmark FIK Number (+71)"),
            ('dk_fik_75', "Denmark FIK Number (+75)"),
        ],
        ondelete={
            'dk_fik_71': lambda recs: recs.write({'invoice_reference_model': 'odoo'}),
            'dk_fik_75': lambda recs: recs.write({'invoice_reference_model': 'odoo'}),
        },
    )

    l10n_dk_fik_creditor_number = fields.Char(
        string="FIK Creditor Number",
        compute='_compute_l10n_dk_fik_creditor_number',
        store=True,
        readonly=False,
    )
    l10n_dk_nemhandel_proxy_state = fields.Selection(related='company_id.l10n_dk_nemhandel_proxy_state')
    is_nemhandel_journal = fields.Boolean(string='Journal used for Nemhandel')

    @api.depends('invoice_reference_model', 'company_id.bank_ids.account_number')
    def _compute_l10n_dk_fik_creditor_number(self):
        for journal in self:
            if journal.invoice_reference_model not in L10N_DK_FIK_MODELS:
                journal.l10n_dk_fik_creditor_number = False
                continue

            bank = journal.company_id.bank_ids[:1]
            creditor_number = '00000000'
            if bank and bank.account_number:
                digits = re.sub(r'\D', '', bank.account_number or '')
                creditor_number = digits[-8:].zfill(8)

            journal.l10n_dk_fik_creditor_number = creditor_number

    @api.constrains('l10n_dk_fik_creditor_number', 'invoice_reference_model')
    def _check_fik_creditor_number(self):
        for record in self:
            if record.invoice_reference_model not in L10N_DK_FIK_MODELS:
                continue

            creditor = record.l10n_dk_fik_creditor_number
            if not creditor or not (creditor.isdigit() and len(creditor) == 8):
                raise ValidationError(self.env._("FIK Creditor Number must be exactly 8 digits."))

    @api.depends('l10n_dk_nemhandel_proxy_state')
    def _compute_show_refresh_out_einvoices_status_button(self):
        # EXTENDS 'account'
        super()._compute_show_refresh_out_einvoices_status_button()
        self.filtered(lambda j: j.l10n_dk_nemhandel_proxy_state == 'receiver' and j.type == 'sale').show_refresh_out_einvoices_status_button = True

    @api.depends('is_nemhandel_journal', 'l10n_dk_nemhandel_proxy_state')
    def _compute_show_fetch_in_einvoices_button(self):
        # EXTENDS 'account'
        super()._compute_show_fetch_in_einvoices_button()

        self.filtered(lambda j: j.is_nemhandel_journal and j.l10n_dk_nemhandel_proxy_state == 'receiver' and j.type == 'purchase').show_fetch_in_einvoices_button = True

    @api.model
    def _prepare_liquidity_account_vals(self, company, code, vals):
        # OVERRIDE
        account_vals = super()._prepare_liquidity_account_vals(company, code, vals)

        if company.account_fiscal_country_id.code == 'DK':
            # Ensure the newly liquidity accounts have the right account tag in order to be part
            # of the Danish financial reports.
            account_vals.setdefault('tag_ids', [])
            if vals.get('type') == 'bank':
                account_vals['tag_ids'].append(Command.link(self.env.ref('l10n_dk.account_tag_6481').id))
            elif vals.get('type') == 'cash':
                account_vals['tag_ids'].append(Command.link(self.env.ref('l10n_dk.account_tag_6471').id))

        return account_vals

    def button_fetch_in_einvoices(self):
        # EXTENDS 'account'
        super().button_fetch_in_einvoices()
        edi_users = self.env['account_edi_proxy_client.user'].search([
            ('company_id.l10n_dk_nemhandel_proxy_state', '=', 'receiver'),
            ('company_id', 'in', self.company_id.ids),
            ('proxy_type', '=', 'nemhandel'),
        ])
        edi_users._nemhandel_get_new_documents()

    def button_refresh_out_einvoices_status(self):
        # EXTENDS 'account'
        super().button_refresh_out_einvoices_status()
        edi_users = self.env['account_edi_proxy_client.user'].search([
            ('company_id.l10n_dk_nemhandel_proxy_state', '=', 'receiver'),
            ('company_id', 'in', self.company_id.ids),
            ('proxy_type', '=', 'nemhandel'),
        ])
        edi_users._nemhandel_get_message_status()
