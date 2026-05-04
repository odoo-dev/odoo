from odoo import models

from odoo.addons.account_edi_ubl_cii.models.account_edi_common import documents, EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES


class AccountEdiUBLPintEU(models.AbstractModel):
    _name = "account.edi.ubl_pint_eu"
    _inherit = 'account.edi.ubl_pint'
    _description = "UBL PINT-EU Layer"

    @property
    def python_class(self):
        return AccountEdiUBLPintEU

    @documents(['invoice', 'credit_note'])
    def _ubl_add_customization_id_node__eu_base(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'

    @documents(['self_invoice', 'self_credit_note'])
    def _ubl_add_customization_id_node__self_base(self, vals):
        super()._ubl_add_customization_id_node(vals)
        vals['document_node']['cbc:CustomizationID']['_text'] = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0'

    @documents(['invoice', 'credit_note'])
    def _ubl_add_profile_id_node__eu_base(self, vals):
        # EXTENDS account.edi.ubl
        super()._ubl_add_profile_id_node(vals)
        vals['document_node']['cbc:ProfileID']['_text'] = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'

    @documents(['self_invoice', 'self_credit_note'])
    def _ubl_add_profile_id_node__self_base(self, vals):
        super()._ubl_add_profile_id_node(vals)
        vals['document_node']['cbc:ProfileID']['_text'] = 'urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0'

    @documents(['invoice', 'self_invoice', 'credit_note', 'self_credit_note'])
    def _ubl_get_delivery_node_from_delivery_address___base(self, vals):
        # EXTENDS account.edi.ubl_pint
        # Intracom delivery inside European area.
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        invoice = vals['invoice']
        customer = vals['customer']
        supplier = vals['supplier']
        if (
            customer.country_id.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
            and supplier.country_id.code in EUROPEAN_ECONOMIC_AREA_COUNTRY_CODES
            and supplier.country_id != customer.country_id
        ):
            node['cbc:ActualDeliveryDate']['_text'] = invoice.invoice_date
        return node

    @documents(['invoice', 'self_invoice', 'credit_note', 'self_credit_note'])
    def _ubl_add_payment_means_nodes__base(self, vals):
        # EXTENDS account.edi.ubl_pint
        super()._ubl_add_payment_means_nodes(vals)

        # [DK] In Denmark payment code 30 is not allowed. Hardcode to 1 ("unknown")
        # as we cannot deduce this information from the invoice.
        customer = vals['customer'].commercial_partner_id
        if customer.country_code == 'DK':
            nodes = vals['document_node']['cac:PaymentMeans']
            for node in nodes:
                node['cbc:PaymentMeansCode']['_text'] = 1
                node['cbc:PaymentMeansCode']['name'] = 'unknown'

    @documents(['credit_note', 'self_credit_note'])
    def _ubl_add_billing_reference_nodes__eu_credit_note(self, vals):
        # EXTENDS account.edi.xml.ubl_pint
        super()._ubl_add_billing_reference_nodes(vals)

        # [NL-R-001] For suppliers in the Netherlands, if the document is a creditnote, the document MUST
        # contain an invoice reference (cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)
        credit_note = vals['invoice']
        nodes = vals['document_node']['cac:BillingReference']
        if (
            vals['supplier'].country_code == 'NL'
            and vals['document_type'] == 'credit_note'
            and credit_note.ref
            and not nodes
        ):
            nodes.append({
                'cac:InvoiceDocumentReference': {
                    'cbc:ID': {'_text': credit_note.ref},
                }
            })
