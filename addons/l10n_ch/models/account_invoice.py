# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re

from odoo import models, fields, api, _
from odoo.exceptions import UserError
from odoo.tools.float_utils import float_split_str
from odoo.tools.misc import mod10r

l10n_ch_QRR_NUMBER_LENGTH = 27
l10n_ch_QR_ID_NUM_LENGTH = 6

class AccountMove(models.Model):
    _inherit = 'account.move'

    l10n_ch_qrr_number = fields.Char(compute='_compute_l10n_ch_qrr_number', store=True, help='The reference number associated with this invoice')

    l10n_ch_qrr_sent = fields.Boolean(default=False, help="Boolean value telling whether or not the QRR corresponding to this invoice has already been printed or sent by mail.")
    l10n_ch_currency_name = fields.Char(related='currency_id.name', readonly=True, string="Currency Name", help="The name of this invoice's currency") #This field is used in the "invisible" condition field of the 'Print ISR' button.
    l10n_ch_qrr_needs_fixing = fields.Boolean(compute="_compute_l10n_ch_qrr_needs_fixing", help="Used to show a warning banner when the vendor bill needs a correct QRR payment reference. ")

    l10n_ch_is_qr_valid = fields.Boolean(compute='_compute_l10n_ch_qr_is_valid', help="Determines whether an invoice can be printed as a QR or not")

    @api.depends('partner_id', 'currency_id')
    def _compute_l10n_ch_qr_is_valid(self):
        for move in self:
            move.l10n_ch_is_qr_valid = move.move_type == 'out_invoice' \
                                       and move.partner_bank_id._eligible_for_qr_code('ch_qr', move.partner_id, move.currency_id, raises_error=False)

    def _get_isrb_id_number(self):
        """Hook to fix the lack of proper field for ISR-B Customer ID"""
        # FIXME
        # replace l10n_ch_postal by an other field to not mix ISR-B
        # customer ID as it forbid the following validations on l10n_ch_postal
        # number for Vendor bank accounts:
        # - validation of format xx-yyyyy-c
        # - validation of checksum
        self.ensure_one()
        return self.partner_bank_id.l10n_ch_postal or ''

    @api.depends('name', 'partner_bank_id.l10n_ch_postal')
    def _compute_l10n_ch_qrr_number(self):
        """Generates the QRR reference.
        QRR references are 27 characters long.

        The invoice sequence number is used, removing each of its non-digit characters,
        and pad the unused spaces on the left of this number with zeros.
        The last digit is a checksum (mod10r).

        There are 2 types of references:
        * ISR (Postfinance)
            The reference is free but for the last digit which is a checksum.
            If shorter than 27 digits, it is filled with zeros on the left.
            e.g.     120000000000234478943216899         (1) 12000000000023447894321689 | reference
                    |_________________________| |        (2) 9: control digit for identification number and reference
                             1                2

        * ISR-B (Indirect through a bank, requires a customer ID)
            In case of ISR-B The firsts digits (usually 6), contain the customer ID at the Bank of this ISR's issuer.
            The rest (usually 20 digits) is reserved for the reference plus the control digit.
            If the [customer ID] + [the reference] + [the control digit] is shorter than 27 digits, it is filled with
            zeros between the customer ID till the start of the reference.
            e.g.    150001123456789012345678901             (1) 150001 | id number of the customer (size may vary)
                    |____||__________________| |            (2) 12345678901234567890 | reference
                        1           2         3             (3) 1: control digit for identification number and reference
        """
        for record in self:
            if record.partner_bank_id.l10n_ch_qr_iban and record.l10n_ch_is_qr_valid and record.name:
                id_number = record._get_isrb_id_number()
                if id_number:
                    id_number = id_number.zfill(l10n_ch_QR_ID_NUM_LENGTH)
                invoice_ref = re.sub('[^\d]', '', record.name)
                # keep only the last digits if it exceed boundaries
                full_len = len(id_number) + len(invoice_ref)
                ref_payload_len = l10n_ch_QRR_NUMBER_LENGTH - 1
                extra = full_len - ref_payload_len
                if extra > 0:
                    invoice_ref = invoice_ref[extra:]
                internal_ref = invoice_ref.zfill(ref_payload_len - len(id_number))
                record.l10n_ch_qrr_number = mod10r(id_number + internal_ref)
            else:
                record.l10n_ch_qrr_number = False

    @api.depends('move_type', 'partner_bank_id', 'payment_reference')
    def _compute_l10n_ch_qrr_needs_fixing(self):
        for inv in self:
            if inv.move_type == 'in_invoice' and inv.company_id.account_fiscal_country_id.code in ('CH', 'LI'):
                partner_bank = inv.partner_bank_id
                needs_qrr_ref = partner_bank.l10n_ch_qr_iban or partner_bank._is_qrr_issuer()
                if needs_qrr_ref and not inv._has_isr_ref():
                    inv.l10n_ch_qrr_needs_fixing = True
                    continue
            inv.l10n_ch_qrr_needs_fixing = False

    def _has_isr_ref(self):
        """Check if this invoice has a valid ISR reference (for Switzerland)
        e.g.
        12371
        000000000000000000000012371
        210000000003139471430009017
        21 00000 00003 13947 14300 09017
        """
        #TODO
        self.ensure_one()
        ref = self.payment_reference or self.ref
        if not ref:
            return False
        ref = ref.replace(' ', '')
        if re.match(r'^(\d{2,27})$', ref):
            return ref == mod10r(ref[:-1])
        return False

    def split_total_amount(self):
        """ Splits the total amount of this invoice in two parts, using the dot as a separator,
        and taking two precision digits (always displayed).
        These two parts are returned as the two elements of a tuple, as strings to print in the report.

        This function is needed on the model, as it must be called in the report template, which cannot
        reference static functions
        """
        return float_split_str(self.amount_residual, 2)

    def action_invoice_sent(self):
        # OVERRIDE
        rslt = super(AccountMove, self).action_invoice_sent()
        if self.l10n_ch_is_qr_valid:
            rslt['context']['l10n_ch_mark_qrr_as_sent'] = True
        return rslt

    @api.returns('mail.message', lambda value: value.id)
    def message_post(self, **kwargs):
        if self.env.context.get('l10n_ch_mark_qrr_as_sent'):
            self.filtered(lambda inv: not inv.l10n_ch_qrr_sent).write({'l10n_ch_qrr_sent': True})
        return super(AccountMove, self.with_context(mail_post_autofollow=self.env.context.get('mail_post_autofollow', True))).message_post(**kwargs)

    def _get_invoice_reference_ch_invoice(self):
        """ This sets QRR reference number which is generated based on customer's `Bank Account` and set it as
        `Payment Reference` of the invoice when invoice's journal is using Switzerland's communication standard
        """
        self.ensure_one()
        return self.l10n_ch_qrr_number

    def _get_invoice_reference_ch_partner(self):
        """ This sets ISR reference number which is generated based on customer's `Bank Account` and set it as
        `Payment Reference` of the invoice when invoice's journal is using Switzerland's communication standard
        """
        self.ensure_one()
        return self.l10n_ch_qrr_number

    @api.model
    def space_qrr_reference(self, qrr_ref):
        """ Makes the provided QRR reference human-friendly, spacing its elements
        by blocks of 5 from right to left.
        """
        spaced_qrr_ref = ''
        i = len(qrr_ref) # i is the index after the last index to consider in substrings
        while i > 0:
            spaced_qrr_ref = qrr_ref[max(i-5, 0) : i] + ' ' + spaced_qrr_ref
            i -= 5
        return spaced_qrr_ref

    @api.model
    def space_scor_reference(self, iso11649_ref):
        """ Makes the provided SCOR reference human-friendly, spacing its elements
        by blocks of 5 from right to left.
        """
        return ' '.join(iso11649_ref[i:i + 4] for i in range(0, len(iso11649_ref), 4))

    def l10n_ch_action_print_qr(self):
        '''
        Checks that all invoices can be printed in the QR format.
        If so, launches the printing action.
        Else, triggers the l10n_ch wizard that will display the informations.
        '''
        if any(x.move_type != 'out_invoice' for x in self):
            raise UserError(_("Only customers invoices can be QR-printed."))
        if False in self.mapped('l10n_ch_is_qr_valid'):
            return {
                'name': (_("Some invoices could not be printed in the QR format")),
                'type': 'ir.actions.act_window',
                'res_model': 'l10n_ch.qr_invoice.wizard',
                'view_type': 'form',
                'view_mode': 'form',
                'target': 'new',
                'context': {'active_ids': self.ids},
            }
        return self.env.ref('account.account_invoices').report_action(self)

    def _l10n_ch_dispatch_invoices_to_print(self):
        qr_invs = self.filtered('l10n_ch_is_qr_valid')
        return {
            'qr': qr_invs,
            'classic': self - qr_invs,
        }
