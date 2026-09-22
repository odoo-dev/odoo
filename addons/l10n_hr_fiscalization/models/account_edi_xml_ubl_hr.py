from odoo import models


class AccountEdiXmlUBLHR(models.AbstractModel):
    _inherit = 'account.edi.xml.ubl_bis3'

    def _add_invoice_header_nodes(self, document_node, vals):
        invoice = vals['invoice']
        document_node.update({
            'cbc:TaxPointDate': {'_text': invoice.taxable_supply_date or invoice.date},
        })
        super()._add_invoice_header_nodes(document_node, vals)
