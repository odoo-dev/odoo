from odoo import models, Command, _
from odoo.tools import html2plaintext


class SaleEdiXmlUbl_Bis3(models.AbstractModel):
    _name = 'sale.edi.xml.ubl_bis3'
    _inherit = ['account.edi.ubl_order']
    _description = "Sale BIS Ordering 3.5"

    # -------------------------------------------------------------------------
    # Sale Order EDI Export
    # -------------------------------------------------------------------------

    def _order_get_parties(self, sale_order):
        # EXTENDS account.edi.ubl_order
        supplier = sale_order.company_id.partner_id.commercial_partner_id
        customer = sale_order.partner_id
        customer_delivery_address = customer.child_ids.filtered(lambda child: child.type == 'delivery')
        delivery = (
            sale_order.partner_shipping_id
            or (customer_delivery_address and customer_delivery_address[0])
            or customer
        )
        return supplier, customer, delivery

    def _order_add_header_nodes(self, vals):
        # EXTENDS account.edi.ubl_order
        sale_order = vals['order']
        vals['document_node'].update({
            'cbc:CustomizationID': {'_text': 'urn:fdc:peppol.eu:poacc:trns:order:3'},
            'cbc:ProfileID': {'_text': 'urn:fdc:peppol.eu:poacc:bis:ordering:3'},
            'cbc:ID': {'_text': sale_order.name},
            'cbc:IssueDate': {'_text': sale_order.create_date.date()},
            'cbc:OrderTypeCode': {'_text': '220'},
            'cbc:Note': {'_text': html2plaintext(sale_order.note)} if sale_order.note else None,
            'cbc:DocumentCurrencyCode': {'_text': vals['currency'].name},
            'cac:ValidityPeriod': {
                'cbc:EndDate': {'_text': sale_order.validity_date},
            },
            'cac:OriginatorDocumentReference': {
                'cbc:ID': {'_text': sale_order.client_order_ref}
            },
        })

    # -------------------------------------------------------------------------
    # Sale Order EDI Import
    # -------------------------------------------------------------------------

    def _get_product_xpaths(self):
        """ The xpaths of the product values of an order line, including the `ExtendedID` field used to
        identify product variants."""
        # EXTENDS account.edi.ubl_order
        return {
            **super()._get_product_xpaths(),
            'variant_barcode': './cac:Item/cac:StandardItemIdentification/cbc:ExtendedID',
            'variant_default_code': './cac:Item/cac:SellersItemIdentification/cbc:ExtendedID',
            'edi_customer_product_ref': './cac:Item/cac:BuyersItemIdentification/cbc:ID',
        }

    def _retrieve_line_vals(self, record, tree, document_type=False, qty_factor=1):
        """Override of `account.edi.ubl_order` to set/update a customer product reference."""
        line_vals = super()._retrieve_line_vals(
            record, tree, document_type=document_type, qty_factor=qty_factor
        )
        line_vals['product_uom_qty'] = line_vals.pop('quantity')
        if not line_vals.get('product_id'):
            # Set customer product reference on order line
            line_vals['edi_customer_product_ref'] = self._find_value(
                './cac:Item/cac:BuyersItemIdentification/cbc:ID', tree
            )
        return line_vals

    def _import_product(self, partner, **product_vals):
        """Override of `account.edi.ubl_order` to search for the product from customer product
        reference."""
        product = super()._import_product(partner, **product_vals)
        if not product:
            # Find product related to customer product reference
            return self.env['customer.product.reference'].sudo().find_product_matching_reference(
                partner, product_vals['edi_customer_product_ref']
            )
        return product

    def _retrieve_order_vals(self, order, tree):
        # EXTENDS account.edi.ubl_order
        order_vals, logs = super()._retrieve_order_vals(order, tree)
        order_vals.pop('note', False)   # The SO Terms & Conditions take precedence over the PO's
        partner, partner_logs = self._import_partner(
            order.company_id,
            **self._import_retrieve_partner_vals(tree, 'BuyerCustomer'),
        )
        if partner:
            order_vals['partner_id'] = partner.id
            # Need to set partner before in order to find products from previous order
            order.partner_id = partner.id
        order_vals['client_order_ref'] = tree.findtext('./{*}ID')
        order_vals['origin'] = tree.findtext('./{*}QuotationDocumentReference/{*}ID')

        delivery_partner, delivery_logs = self._import_partner(
            order.company_id,
            **self._import_retrieve_partner_vals(tree, 'Delivery'),
        )
        if delivery_partner:
            order_vals['partner_shipping_id'] = delivery_partner.id

        allowance_charges_line_vals, allowance_charges_logs = self._import_document_allowance_charges(tree, order, 'sale')
        lines_vals, line_logs = self._import_lines(order, tree, './{*}OrderLine/{*}LineItem', document_type='order', tax_type='sale')
        # adapt each line to sale.order.line
        for line in lines_vals:
            if not line.get('product_id'):
                line_logs.append(_("Could not retrieve the product named: %(name)s", name=line['name']))
            if line.get('discount'):  # Exclude discounts
                line.pop('discount')
        lines_vals += allowance_charges_line_vals

        # Update order with lines excluding discounts
        order_vals['order_line'] = [Command.create(line_vals) for line_vals in lines_vals]
        logs += partner_logs + delivery_logs + line_logs + allowance_charges_logs

        return order_vals, logs

    def _import_order_ubl(self, order, file_data, new):
        # Overriding the main method to recalculate the price unit and discount
        res = super()._import_order_ubl(order, file_data, new)
        lines_with_products = order.order_line.filtered('product_id')
        # Recompute product price and discount according to sale price
        lines_with_products._compute_price_unit()
        lines_with_products._compute_discount()

        return res
