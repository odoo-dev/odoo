##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import models, fields, api, _
from odoo.exceptions import UserError
# import odoo.addons.decimal_precision as dp
# import re
# from odoo.tools.misc import formatLang
import logging
_logger = logging.getLogger(__name__)


class AccountInvoice(models.Model):
    """
    about name_get and display name:
    * in this model name_get and name_search are re-defined so we overwrite
    them
    * we add display_name to replace name field use, we add
     with search funcion. This field is used then for name_get and name_search

    Acccoding this https://www.odoo.com/es_ES/forum/ayuda-1/question/
    how-to-override-name-get-method-in-new-api-61228
    we should modify name_get, we do that by creating a helper display_name
    field and also overwriting name_get to use it
    """
    _inherit = "account.invoice"
    _order = "date_invoice desc, document_number desc, number desc, id desc"
    # _order = "document_number desc, number desc, id desc"

    report_amount_tax = fields.Monetary(
        string='Tax',
        compute='_compute_report_amount_and_taxes'
    )
    report_amount_untaxed = fields.Monetary(
        string='Untaxed Amount',
        compute='_compute_report_amount_and_taxes'
    )
    report_tax_line_ids = fields.One2many(
        compute="_compute_report_amount_and_taxes",
        comodel_name='account.invoice.tax',
        string='Taxes'
    )
    available_journal_document_type_ids = fields.Many2many(
        'account.journal.document.type',
        compute='_compute_available_journal_document_types',
        string='Available Journal Document Types',
    )
    journal_document_type_id = fields.Many2one(
        'account.journal.document.type',
        'Document Type',
        readonly=True,
        ondelete='restrict',
        copy=False,
        auto_join=True,
        states={'draft': [('readonly', False)]}
    )
    # we add this fields so we can search, group and analyze by this one
    document_type_id = fields.Many2one(
        related='journal_document_type_id.document_type_id',
        copy=False,
        readonly=True,
        store=True,
        auto_join=True,
        index=True,
    )
    document_sequence_id = fields.Many2one(
        related='journal_document_type_id.sequence_id',
        readonly=True,
    )
    document_number = fields.Char(
        string='Document Number',
        copy=False,
        readonly=True,
        states={'draft': [('readonly', False)]},
        track_visibility='onchange',
        index=True,
    )
    display_name = fields.Char(
        compute='_compute_display_name',
        string='Document Reference',
    )
    next_number = fields.Integer(
        compute='_compute_next_number',
        string='Next Number',
    )
    use_documents = fields.Boolean(
        related='journal_id.use_documents',
        string='Use Documents?',
        readonly=True,
    )
    localization = fields.Selection(
        related='company_id.localization',
        readonly=True,
    )
    document_type_internal_type = fields.Selection(
        related='document_type_id.internal_type',
        readonly=True,
    )

# @api.multi
# def _get_tax_amount_by_group(self):
#     """ Method used by qweb invoice report. We are not using this report
#     for now.
#     """
#     self.ensure_one()
#     res = {}
#     currency = self.currency_id or self.company_id.currency_id
#     for line in self.report_tax_line_ids:
#         res.setdefault(line.tax_id.tax_group_id, 0.0)
#         res[line.tax_id.tax_group_id] += line.amount
#     res = sorted(res.items(), key=lambda l: l[0].sequence)
#     res = map(lambda l: (
#         l[0].name, formatLang(self.env, l[1], currency_obj=currency)), res)
#     return res

    @api.depends(
        'amount_untaxed', 'amount_tax', 'tax_line_ids', 'document_type_id')
    def _compute_report_amount_and_taxes(self):
        for invoice in self:
            taxes_included = (
                invoice.document_type_id and
                invoice.document_type_id.get_taxes_included() or False)
            if not taxes_included:
                report_amount_tax = invoice.amount_tax
                report_amount_untaxed = invoice.amount_untaxed
                not_included_taxes = invoice.tax_line_ids
            else:
                included_taxes = invoice.tax_line_ids.filtered(
                    lambda x: x.tax_id in taxes_included)
                not_included_taxes = (
                    invoice.tax_line_ids - included_taxes)
                report_amount_tax = sum(not_included_taxes.mapped('amount'))
                report_amount_untaxed = invoice.amount_untaxed + sum(
                    included_taxes.mapped('amount'))
            invoice.report_amount_tax = report_amount_tax
            invoice.report_amount_untaxed = report_amount_untaxed
            invoice.report_tax_line_ids = not_included_taxes

    @api.multi
    @api.depends(
        'journal_id.sequence_id.number_next_actual',
        'journal_document_type_id.sequence_id.number_next_actual',
    )
    def _compute_next_number(self):
        """
        show next number only for invoices without number and on draft state
        """
        for invoice in self.filtered(
                lambda x: not x.display_name and x.state == 'draft'):
            if invoice.use_documents:
                sequence = invoice.journal_document_type_id.sequence_id
            elif (
                    invoice.type in ['out_refund', 'in_refund'] and
                    invoice.journal_id.refund_sequence
            ):
                sequence = invoice.journal_id.refund_sequence_id
            else:
                sequence = invoice.journal_id.sequence_id
            # we must check if sequence use date ranges
            if not sequence.use_date_range:
                invoice.next_number = sequence.number_next_actual
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
                invoice.next_number = seq_date.number_next_actual

    @api.multi
    def name_get(self):
        TYPES = {
            'out_invoice': _('Invoice'),
            'in_invoice': _('Vendor Bill'),
            'out_refund': _('Refund'),
            'in_refund': _('Vendor Refund'),
        }
        result = []
        for inv in self:
            result.append((
                inv.id,
                "%s %s" % (
                    inv.display_name or TYPES[inv.type],
                    inv.name or '')))
        return result

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        args = args or []
        recs = self.browse()
        if name:
            recs = self.search([
                '|', ('document_number', '=', name),
                ('number', '=', name)] + args, limit=limit)
        if not recs:
            recs = self.search([('name', operator, name)] + args, limit=limit)
        return recs.name_get()

    @api.multi
    @api.constrains(
        'journal_id',
        'partner_id',
        'journal_document_type_id',
    )
    def _get_document_type(self):
        """ Como los campos responsible y journal document type no los
        queremos hacer funcion porque no queremos que sus valores cambien nunca
        y como con la funcion anterior solo se almacenan solo si se crea desde
        interfaz, hacemos este hack de constraint para computarlos si no estan
        computados"""
        for rec in self.filtered(
                lambda x: not x.journal_document_type_id and
                x.available_journal_document_type_ids):
            rec.journal_document_type_id = (
                rec._get_available_journal_document_types(
                    rec.journal_id, rec.type, rec.partner_id
                ).get('journal_document_type'))

    @api.multi
    @api.depends(
        'move_name',
        'document_number',
        'document_type_id.doc_code_prefix'
    )
    def _compute_display_name(self):
        """
        If move_name then invoice has been validated, then:
        * If document number and document type, we show them
        * Else, we show move_name
        """
        # al final no vimos porque necesiamos que este el move name, es util
        # mostrar igual si existe el numero, por ejemplo si es factura de
        # proveedor
        # if self.document_number and self.document_type_id and self.move_name:
        for rec in self:
            if rec.document_number and rec.document_type_id:
                display_name = ("%s%s" % (
                    rec.document_type_id.doc_code_prefix or '',
                    rec.document_number))
            else:
                display_name = rec.move_name
            rec.display_name = display_name

    @api.multi
    def check_use_documents(self):
        """
        check invoices has document class but journal require it (we check
        all invoices, not only argentinian ones)
        """
        without_doucument_class = self.filtered(
            lambda r: (
                not r.document_type_id and r.journal_id.use_documents))
        if without_doucument_class:
            raise UserError(_(
                'Some invoices have a journal that require a document but not '
                'document type has been selected.\n'
                'Invoices ids: %s' % without_doucument_class.ids))

    @api.multi
    def get_localization_invoice_vals(self):
        """
        Function to be inherited by different localizations and add custom
        data to invoice on invoice validation
        """
        self.ensure_one()
        return {}

    @api.multi
    def action_move_create(self):
        """
        We add currency rate on move creation so it can be used by electronic
        invoice later on action_number
        """
        self.check_use_documents()
        res = super(AccountInvoice, self).action_move_create()
        self.set_document_data()
        return res

    @api.multi
    def set_document_data(self):
        """
        If journal document dont have any sequence, then document number
        must be set on the account.invoice and we use thisone
        A partir de este metodo no debería haber errores porque el modulo de
        factura electronica ya habria pedido el cae. Lo ideal sería hacer todo
        esto antes que se pida el cae pero tampoco se pueden volver a atras los
        conusmos de secuencias. TODO mejorar esa parte
        """
        # We write document_number field with next invoice number by
        # document type
        for invoice in self:
            _logger.info(
                'Setting document data on account.invoice and account.move')
            journal_document_type = invoice.journal_document_type_id
            inv_vals = self.get_localization_invoice_vals()
            if invoice.use_documents:
                if not invoice.document_number:
                    if not invoice.journal_document_type_id.sequence_id:
                        raise UserError(_(
                            'Error!. Please define sequence on the journal '
                            'related documents to this invoice or set the '
                            'document number.'))
                    document_number = (
                        journal_document_type.sequence_id.next_by_id())
                    inv_vals['document_number'] = document_number
                # for canelled invoice number that still has a document_number
                # if validated again we use old document_number
                # also use this for supplier invoices
                else:
                    document_number = invoice.document_number
                invoice.move_id.write({
                    'document_type_id': (
                        journal_document_type.document_type_id.id),
                    'document_number': document_number,
                })
            invoice.write(inv_vals)
        return True

    @api.multi
    # creo que por el parche de del def onchange no estaria funcionando
    # y por eseo repetimos onchnage de cada elemento
    # TODO analizar en v11
    # @api.onchange('available_journal_document_type_ids')
    @api.onchange('journal_id', 'partner_id', 'company_id')
    def onchange_available_journal_document_types(self):
        res = self._get_available_journal_document_types(
            self.journal_id, self.type, self.partner_id)
        self.journal_document_type_id = res['journal_document_type']
        # las localizaciones no siempre devuelven el primero como el que debe
        # sugerir por defecto, si cambiamos para que asi sea entonces podemos
        # cambiar esto aca
        # self.journal_document_type_id = self.\
        #     available_journal_document_type_ids and self.\
        #     available_journal_document_type_ids[0] or False

    @api.multi
    @api.depends('journal_id', 'partner_id', 'company_id')
    def _compute_available_journal_document_types(self):
        """
        This function should only be inherited if you need to add another
        "depends", for eg, if you need to add a depend on "new_field" you
        should add:

        @api.depends('new_field')
        def _get_available_journal_document_types(
                self, journal, invoice_type, partner):
            return super(
                AccountInvoice, self)._get_available_journal_document_types(
                    journal, invoice_type, partner)
        """
        for invoice in self:
            res = invoice._get_available_journal_document_types(
                invoice.journal_id, invoice.type, invoice.partner_id)
            invoice.available_journal_document_type_ids = res[
                'available_journal_document_types']
            # esto antes lo haciamos aca pero computaba mal el proximo numero
            # de factura cuando se seleccionaba otro tipo de doc que no sea
            # el por defecto (por ej, nota de debito), lo separamos en un
            # onchange aparte
            # invoice.journal_document_type_id = res[
            #     'journal_document_type']

    @api.multi
    def write(self, vals):
        """
        If someone change the type (for eg from sale order), we update
        de document type
        """
        inv_type = vals.get('type')
        # if len(vals) == 1 and vals.get('type'):
        # podrian pasarse otras cosas ademas del type
        if inv_type:
            for rec in self:
                res = rec._get_available_journal_document_types(
                    rec.journal_id, inv_type, rec.partner_id)
                vals['journal_document_type_id'] = res[
                    'journal_document_type'].id
                # call write for each inoice
                super(AccountInvoice, rec).write(vals)
                return True
        return super(AccountInvoice, self).write(vals)

    @api.model
    def _get_available_journal_document_types(
            self, journal, invoice_type, partner):
        """
        This function is to be inherited by differents localizations and MUST
        return a dictionary with two keys:
        * 'available_journal_document_types': available document types on
        this invoice
        * 'journal_document_type': suggested document type on this invoice
        """
        # if journal dont use documents return empty recordsets just in case
        # there are journal_document_type_ids related to the journal
        if not journal.use_documents:
            return {
                'available_journal_document_types':
                    self.env['account.journal.document.type'],
                'journal_document_type':
                    self.env['account.journal.document.type'],
            }
        # As default we return every journal document type, and if one exists
        # then we return the first one as suggested
        journal_document_types = journal.journal_document_type_ids
        # if invoice is a refund only show credit_notes, else, not credit note
        if invoice_type in ['out_refund', 'in_refund']:
            journal_document_types = journal_document_types.filtered(
                # lambda x: x.document_type_id.internal_type == 'credit_note')
                lambda x: x.document_type_id.internal_type in [
                    'credit_note', 'in_document'])
        else:
            journal_document_types = journal_document_types.filtered(
                lambda x: x.document_type_id.internal_type != 'credit_note')
        journal_document_type = (
            journal_document_types and journal_document_types[0] or
            journal_document_types)
        return {
            'available_journal_document_types': journal_document_types,
            'journal_document_type': journal_document_type,
        }

    @api.multi
    @api.constrains('document_type_id', 'document_number')
    @api.onchange('document_type_id', 'document_number')
    def validate_document_number(self):
        # if we have a sequence, number is set by sequence and we dont
        # check this
        for rec in self.filtered(
                lambda x: not x.document_sequence_id and x.document_type_id):
            res = rec.document_type_id.validate_document_number(
                rec.document_number)
            if res and res != rec.document_number:
                rec.document_number = res

    @api.multi
    @api.constrains('journal_document_type_id', 'journal_id')
    def check_journal_document_type_journal(self):
        for rec in self:
            if rec.journal_document_type_id and (
                    rec.journal_document_type_id.journal_id != rec.journal_id):
                raise Warning(_(
                    'El Tipo de Documento elegido "%s" no pertenece al diario'
                    ' "%s". Por favor pruebe elegir otro tipo de documento.'
                    'Puede refrezcar los tipos de documentos disponibles '
                    'cambiando el diario o el partner.') % ((
                        rec.journal_document_type_id.display_name,
                        rec.journal_id.name)))

    @api.multi
    @api.constrains('type', 'document_type_id')
    def check_invoice_type_document_type(self):
        for rec in self:
            internal_type = rec.document_type_internal_type
            invoice_type = rec.type
            if not internal_type:
                continue
            elif internal_type in [
                    'debit_note', 'invoice'] and invoice_type in [
                    'out_refund', 'in_refund']:
                raise Warning(_(
                    'You can not use a %s document type with a refund '
                    'invoice') % internal_type)
            elif internal_type == 'credit_note' and invoice_type in [
                    'out_invoice', 'in_invoice']:
                raise Warning(_(
                    'You can not use a %s document type with a invoice') % (
                    internal_type))

    @api.model
    def _prepare_refund(
            self, invoice, date_invoice=None,
            date=None, description=None, journal_id=None):
        values = super(AccountInvoice, self)._prepare_refund(
            invoice, date_invoice=date_invoice,
            date=date, description=description, journal_id=journal_id)
        refund_journal_document_type_id = self._context.get(
            'refund_journal_document_type_id', False)
        refund_document_number = self._context.get(
            'refund_document_number', False)
        if refund_journal_document_type_id:
            values['journal_document_type_id'] = \
                refund_journal_document_type_id
        if refund_document_number:
            values['document_number'] = refund_document_number
        return values

    @api.multi
    def _check_duplicate_supplier_reference(self):
        """We make reference only unique if you are not using documents.
        Documents already guarantee to not encode twice same vendor bill.
        """
        return super(
            AccountInvoice, self.filtered(lambda x: not x.use_documents))

    @api.multi
    @api.constrains('document_number', 'partner_id', 'company_id')
    def _check_document_number_unique(self):
        """ We dont implement this on _check_duplicate_supplier_reference
        because we want to check it on data entry and also because we validate
        customer invoices (not only supplier ones)
        """
        for rec in self.filtered(
                lambda x: x.use_documents and x.document_number):
            domain = [
                ('type', '=', rec.type),
                ('document_number', '=', rec.document_number),
                ('document_type_id', '=', rec.document_type_id.id),
                ('company_id', '=', rec.company_id.id),
                ('id', '!=', rec.id)
            ]
            msg = (
                'Error en factura con id %s: El numero de comprobante (%s)'
                ' debe ser unico por tipo de documento')
            if rec.type in ['out_invoice', 'out_refund']:
                # si es factura de cliente entonces tiene que ser numero
                # unico por compania y tipo de documento
                rec.search(domain)
            else:
                # si es factura de proveedor debe ser unica por proveedor
                domain += [
                    ('partner_id.commercial_partner_id', '=',
                        rec.commercial_partner_id.id)]
                msg += ' y proveedor'
            if rec.search(domain):
                raise UserError(msg % (rec.id, rec.document_number))
