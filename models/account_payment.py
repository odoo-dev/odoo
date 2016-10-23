# -*- coding: utf-8 -*-
##############################################################################
# For copyright and license notices, see __openerp__.py file in module root
# directory
##############################################################################
from openerp import models, fields, api, _
from openerp.exceptions import UserError
import logging
_logger = logging.getLogger(__name__)


class AccountPayment(models.Model):
    _inherit = "account.payment"

    # document_number = fields.Char(
    #     string=_('Document Number'),
    #     related='move_id.document_number',
    #     readonly=True,
    #     store=True,
    #     )
    document_number = fields.Char(
        string='Document Number',
        copy=False,
        readonly=True,
        states={'draft': [('readonly', False)]}
    )
    document_sequence_id = fields.Many2one(
        related='receiptbook_id.sequence_id',
    )
    localization = fields.Selection(
        related='company_id.localization',
    )
    # por ahora no agregamos esto, vamos a ver si alguien lo pide
    # manual_prefix = fields.Char(
    #     related='receiptbook_id.prefix',
    #     string='Prefix',
    #     readonly=True,
    #     copy=False
    # )
    # manual_sufix = fields.Integer(
    #     'Number',
    #     readonly=True,
    #     states={'draft': [('readonly', False)]},
    #     copy=False
    # )
    # TODO depreciate this field on v9
    # be care that sipreco project use it
    # force_number = fields.Char(
    #     'Force Number',
    #     readonly=True,
    #     states={'draft': [('readonly', False)]},
    #     copy=False
    # )
    receiptbook_id = fields.Many2one(
        'account.payment.receiptbook',
        'ReceiptBook',
        readonly=True,
        states={'draft': [('readonly', False)]},
    )
    document_type_id = fields.Many2one(
        related='receiptbook_id.document_type_id',
        readonly=True,
    )
    next_number = fields.Integer(
        # related='receiptbook_id.sequence_id.number_next_actual',
        compute='_get_next_number',
        string='Next Number',
        readonly=True
    )
    display_name = fields.Char(
        compute='_get_display_name',
    )

    @api.multi
    @api.depends(
        'journal_id.sequence_id.number_next_actual',
        'receiptbook_id.sequence_id.number_next_actual',
    )
    def _get_next_number(self):
        """
        show next number only for payments without number and on draft state
        """
        for payment in self.filtered(
                lambda x: x.state == 'draft'):
            if payment.receiptbook_id:
                sequence = payment.receiptbook_id.sequence_id
            else:
                sequence = payment.journal_id.sequence_id
            # we must check if sequence use date ranges
            if not sequence.use_date_range:
                payment.next_number = sequence.number_next_actual
            else:
                dt = fields.Date.today()
                if self.env.context.get('ir_sequence_date'):
                    dt = self.env.context.get('ir_sequence_date')
                seq_date = self.env['ir.sequence.date_range'].search([
                    ('sequence_id', '=', sequence.id),
                    ('date_from', '<=', dt),
                    ('date_to', '>=', dt)], limit=1)
                if not seq_date:
                    seq_date = sequence._create_date_range_seq(dt)
                payment.next_number = seq_date.number_next_actual

    @api.one
    @api.depends(
        # 'move_name',
        'document_number',
        'document_type_id.doc_code_prefix'
    )
    def _get_display_name(self):
        """
        If move_line_ids then payment has been validated, then:
        * If document number and document type, we show them
        * Else, we show name
        """
        if (
                self.move_line_ids and self.document_number and
                self.document_type_id):
            display_name = ("%s%s" % (
                self.document_type_id.doc_code_prefix or '',
                self.document_number))
        else:
            display_name = self.name
        self.display_name = display_name

    _sql_constraints = [
        ('name_uniq', 'unique(document_number, receiptbook_id)',
            'Document number must be unique per receiptbook!')]

    @api.one
    @api.constrains('company_id')
    @api.onchange('company_id')
    def _change_company(self):
        # we add cosntrins to fix odoo tests and also help in inmpo of data
        if not self.receiptbook_id:
            self.receiptbook_id = self._get_receiptbook()

    @api.multi
    def _get_receiptbook(self):
        self.ensure_one()
        receiptbook = self.env[
            'account.payment.receiptbook'].search([
                ('payment_type', '=', self._context.get(
                    'payment_type', self._context.get(
                        'default_payment_type', False))),
                ('company_id', '=', self.company_id.id),
            ], limit=1)
        return receiptbook

    @api.multi
    def post(self):
        for rec in self:
            if rec.localization:
                if not rec.document_number:
                    if not rec.receiptbook_id.sequence_id:
                        raise UserError(_(
                            'Error!. Please define sequence on the receiptbook'
                            ' related documents to this payment or set the '
                            'document number.'))
                    rec.document_number = (
                        rec.receiptbook_id.sequence_id.next_by_id())
        return super(AccountPayment, self).post()

    def _get_move_vals(self, journal=None):
        vals = super(AccountPayment, self)._get_move_vals()
        vals['document_type_id'] = self.document_type_id.id
        vals['document_number'] = self.document_number
        return vals

    @api.one
    @api.constrains('receiptbook_id', 'company_id')
    def _check_company_id(self):
        """
        Check receiptbook_id and voucher company
        """
        if (self.receiptbook_id and
                self.receiptbook_id.company_id != self.company_id):
            raise Warning(_(
                'The company of the receiptbook and of the '
                'payment must be the same!'))
