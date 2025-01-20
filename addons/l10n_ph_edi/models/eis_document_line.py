# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models, fields, api


class EisDocumentLine(models.Model):
    """
    Represents an EIS document line.

    Storing these separately allows full abstraction from the original model when building an EIS document, effectively
    allowing to build them from any models without the need to add model specific logic for the file generation.

    Note that all amounts in the document must be in PHP, but we will store it in company currency here.
    Translation in PHP will be done if needed when building the JSON file, using the rate at the date of the document.
    """
    _name = "eis.document.line"
    _description = "EIS Document Line"
    _check_company_auto = True

    # ---------------
    # Default methods
    # ---------------

    # ------------------
    # Fields declaration
    # ------------------

    eis_document_id = fields.Many2one(
        comodel_name='eis.document',
    )
    name = fields.Char()  # Product name
    description = fields.Char()  # product description_sale
    quantity = fields.Float()
    uom_id = fields.Many2one(
        comodel_name='uom.uom'
    )
    unit_price = fields.Monetary()
    subtotal = fields.Monetary(
        compute='_compute_amounts',
    )
    regular_discount = fields.Monetary()  # discount amount, not percentage
    special_discount = fields.Monetary()  # todo figure it out
    net_total = fields.Monetary(
        compute="_compute_amounts",
    )
    tax_ids = fields.Many2many(
        comodel_name='account.tax',
        string="Taxes",
        context={'active_test': False},
        check_company=True,
    )
    currency_id = fields.Many2one(
        related='eis_document_id.currency_id',
    )
    company_id = fields.Many2one(
        related='eis_document_id.company_id',
    )

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    @api.depends('quantity', 'unit_price', 'regular_discount', 'special_discount')
    def _compute_amounts(self):
        for line in self:
            line.subtotal = line.quantity * line.unit_price
            # For VATable sales, special discount is not considered.
            vatable = line.eis_document_id.eis_transaction_class == '01'
            line.net_total = line.subtotal - (line.regular_discount + (line.special_discount if not vatable else 0.0))

    # ----------------
    # Business methods
    # ----------------

    def _eis_make_line_information(self, document_data):
        """
        Returns a dict with the values of the line.
        Note that the EIS does not require to provide tax details per line, only totals on the document level.
        """
        self.ensure_one()
        if not document_data['ItemList']:
            document_data['ItemList'] = []

        # Check the currency and apply the conversion rate if needed.
        php = self.env.ref('base.PHP')

        document_data['ItemList'].append({
            'Nm': self.name,
            'Desc': self.description,
            'Qty': self.quantity,
            'Unit': self.uom_id.name or 'Unit',
            'UnitCost': self.currency_id._convert(self.unit_price, php, self.company_id, self.eis_document_id.date),
            'SalesAmt': self.currency_id._convert(self.subtotal, php, self.company_id, self.eis_document_id.date),
            'RegDscntAmt': self.currency_id._convert(self.regular_discount, php, self.company_id, self.eis_document_id.date),
            'SpeDscntAmt': self.currency_id._convert(self.special_discount, php, self.company_id, self.eis_document_id.date),
            'NetSales': self.currency_id._convert(self.net_total, php, self.company_id, self.eis_document_id.date),
        })
