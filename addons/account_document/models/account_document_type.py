from odoo import fields, models, api
# from odoo.exceptions import UserError


class AccountDocmentType(models.Model):
    _name = 'account.document.type'
    _description = 'Account Document Type'
    _order = 'sequence, id asc'

    def _get_localizations(self):
        localizations = self.env['res.company']._fields[
            'localization']._description_selection(self.env)
        return localizations

    sequence = fields.Integer(
        default=10,
        required=True,
        help="Used to order records in tree views and relational fields"
    )
    localization = fields.Selection(
        _get_localizations,
        'Localization',
        help='If you set a localization here then it will be available only '
        'for companies of this localization',
        index=True,
    )
    name = fields.Char(
        'Name',
        required=True,
        index=True,
    )
    doc_code_prefix = fields.Char(
        'Document Code Prefix',
        help="Prefix for Documents Codes on Invoices and Account Moves. "
        "For eg. 'FA ' will build 'FA 0001-0000001' Document Number"
    )
    code = fields.Char(
        'Code',
        help='Code used by differents localizations',
    )
    report_name = fields.Char(
        'Name on Reports',
        help='Name that will be printed in reports, for example "CREDIT NOTE"'
    )
    internal_type = fields.Selection([
        ('invoice', 'Invoices'),
        ('debit_note', 'Debit Notes'),
        ('credit_note', 'Credit Notes'),
        ('ticket', 'Ticket'),
        ('receipt_invoice', 'Receipt Invoice'),
        ('customer_payment', 'Customer Voucer'),
        ('supplier_payment', 'Supplier Invoice'),
        # ('inbound_payment_voucher', 'Inbound Payment Voucer'),
        # ('outbound_payment_voucher', 'Outbound Payment Voucer'),
        ('in_document', 'In Document'),
    ],
        string='Internal Type',
        index=True,
        help='On each localization each document type may have a different use'
        # help='It defines some behaviours on different places:\
        # * invoice: used on sale and purchase journals. Auto selected if not\
        # debit_note specified on context.\
        # * debit_note: used on sale and purchase journals but with lower\
        # priority than invoices.\
        # * credit_note: used on sale_refund and purchase_refund journals.\
        # * ticket: automatically loaded for purchase journals but only loaded\
        # on sales journals if point_of_sale is fiscal_printer\
        # * receipt_invoice: mean to be used as invoices but not automatically\
        # loaded because it is not usually used\
        # * in_document: automatically loaded for purchase journals but not \
        # loaded on sales journals. Also can be selected on partners, to be \
        # available it must be selected on partner.\'
    )
    active = fields.Boolean(
        'Active',
        default=True
    )
    validator_id = fields.Many2one(
        'base.validator',
        'Validator',
    )
    taxes_included = fields.Boolean(
        'Taxes Included?',
        help='Documents of this type will include taxes on reports. This '
        'behaviour could be overwritten by localizations!',
    )

    @api.multi
    def validate_document_number(self, document_number):
        self.ensure_one()
        if self.validator_id:
            return self.validator_id.validate_value(document_number)
        return False

    @api.multi
    def name_get(self):
        result = []
        for rec in self:
            name = rec.name
            if rec.code:
                name = '(%s) %s' % (rec.code, name)
            result.append((rec.id, name))
        return result

    @api.multi
    def get_document_sequence_vals(self, journal):
        self.ensure_one()
        # TODO we could improove this and add a field for templating numbering
        return {
            'name': '%s - %s' % (journal.name, self.name),
            'padding': 8,
            'prefix': self.code,
        }

    @api.multi
    def get_taxes_included(self):
        """
        This method is to be inherited by differents localizations and should
        return which taxes should be included or not on reports of this
        document type
        """
        self.ensure_one()
        return self.taxes_included and self.env[
            'account.tax'].search([]) or self.env['account.tax']
