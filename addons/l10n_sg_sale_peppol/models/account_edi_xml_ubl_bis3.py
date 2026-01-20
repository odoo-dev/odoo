from odoo import models


class AccountEdiXmlUbl_Bis3(models.AbstractModel):
    _inherit = 'account.edi.xml.pint_sg'

    def _add_invoice_header_nodes(self, document_node, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._add_invoice_header_nodes(document_node, vals)

        invoice = vals['invoice']
        document_node.update({
            'cbc:BuyerReference': {'_text': invoice.ref},
        })

    def _ubl_add_invoice_line_node(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._ubl_add_invoice_line_node(vals)
        self._l10n_sg_peppol_add_order_line_reference_node(vals)

    def _l10n_sg_peppol_add_order_line_reference_node(self, vals):
        line_item_ref = vals['line_vals']['base_line']['record'].l10n_sg_ubl_line_item_ref
        if line_item_ref:
            vals['line_node']['cac:OrderLineReference'] = {
                'cbc:LineID': {'_text': line_item_ref},
            }

    def _ubl_add_order_reference_node(self, vals):
        # OVERRIDES account.edi.xml.ubl_bis3
        # Not calling super()._ubl_add_order_reference_node to bypass parent module's implementation
        vals['document_node']['cac:OrderReference'] = {
            'cbc:ID': {'_text': None},
            'cbc:SalesOrderID': {
                '_text': None,
            },
        }

        invoice = vals.get('invoice')
        sale_orders = invoice.line_ids.sale_line_ids.order_id
        if len(sale_orders) != 1:
            return

        vals['document_node']['cac:OrderReference'] = {
            'cbc:ID': {'_text': sale_orders.l10n_sg_peppol_order_id or 'NA'},  # Mandatory field
            'cbc:SalesOrderID': {
                '_text': sale_orders.name,
            },
        }
