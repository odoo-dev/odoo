from odoo import _, api, models
from odoo.tools.misc import str2bool

from stdnum.no import mva


class AccountEdiUblPintEuInvoice(models.AbstractModel):
    _name = "account.edi.ubl_pint_eu_invoice"
    _inherit = 'account.edi.ubl_pint_eu'
    _description = "UBL PINT EU Invoice"

    def _export_invoice_filename(self, invoice):
        return f"{invoice.name.replace('/', '_')}_bis3.xml"

    def _ubl_get_ubl_delivery_node(self, vals):
        # EXTENDS
        invoice = vals['invoice']
        node = super()._ubl_get_ubl_delivery_node(vals)
        node['cbc:ActualDeliveryDate']['_text'] = invoice.delivery_date
        return node

    def _ubl_get_ubl_payment_means_node(self, vals):
        # EXTENDS
        invoice = vals['invoice']
        node = super()._ubl_get_ubl_payment_means_node(vals)
        customer = vals['customer']['partner']

        if invoice.move_type == 'out_invoice':
            if invoice.partner_bank_id:
                payment_means_code, payment_means_name = 30, 'credit transfer'
            else:
                payment_means_code, payment_means_name = 'ZZZ', 'mutually defined'
        else:
            payment_means_code, payment_means_name = 57, 'standing agreement'

        # in Denmark payment code 30 is not allowed. we hardcode it to 1 ("unknown") for now
        # as we cannot deduce this information from the invoice
        if customer.country_code == 'DK':
            payment_means_code, payment_means_name = 1, 'unknown'

        node['cbc:PaymentMeansCode']['_text'] = payment_means_code
        node['cbc:PaymentMeansCode']['name'] = payment_means_name
        node['cbc:PaymentID']['_text'] = invoice.payment_reference or invoice.name
        node['cbc:PayeeFinancialAccount'] = self._ubl_get_ubl_payment_means_payee_financial_account_node(vals)
        return node
