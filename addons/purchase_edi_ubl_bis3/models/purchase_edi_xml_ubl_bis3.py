from odoo import models, Command, _
from odoo.tools import html2plaintext


class PurchaseEdiXmlUbl_Bis3(models.AbstractModel):
    _name = 'purchase.edi.xml.ubl_bis3'
    _inherit = ['account.edi.ubl_order']
    _description = "Purchase UBL BIS Ordering 3.5"

    # -------------------------------------------------------------------------
    # Purchase Order EDI Export
    # -------------------------------------------------------------------------

    def _order_prepare_base_lines(self, vals):
        # EXTENDS account.edi.ubl_order
        super()._order_prepare_base_lines(vals)
        for base_line in vals['base_lines']:
            product = base_line['product_id']
            partner = base_line['partner_id']
            supplier_info = product.variant_seller_ids.filtered(lambda s:
                s.partner_id == partner
                and (
                    s.product_id == product
                    or (not s.product_id and s.product_tmpl_id == product.product_tmpl_id)
                )
                and (s.product_code or s.product_name),
            )[:1]
            base_line['supplier_info'] = supplier_info

    def _order_get_parties(self, purchase_order):
        # EXTENDS account.edi.ubl_order
        supplier = purchase_order.partner_id
        customer = purchase_order.company_id.partner_id.commercial_partner_id
        customer_delivery_address = customer.child_ids.filtered(lambda child: child.type == 'delivery')
        delivery = (
            purchase_order.dest_address_id
            or (customer_delivery_address and customer_delivery_address[0])
            or customer
        )
        return supplier, customer, delivery

    def _order_add_header_nodes(self, vals):
        # EXTENDS account.edi.ubl_order
        purchase_order = vals['order']
        vals['document_node'].update({
            'cbc:CustomizationID': {'_text': 'urn:fdc:peppol.eu:poacc:trns:order:3'},
            'cbc:ProfileID': {'_text': 'urn:fdc:peppol.eu:poacc:bis:ordering:3'},
            'cbc:ID': {'_text': purchase_order.name},
            'cbc:IssueDate': {'_text': purchase_order.create_date.date()},
            'cbc:OrderTypeCode': {'_text': '105'},
            'cbc:Note': {'_text': html2plaintext(purchase_order.note)} if purchase_order.note else None,
            'cbc:DocumentCurrencyCode': {'_text': vals['currency'].name},
            'cac:QuotationDocumentReference': {
                'cbc:ID': {'_text': purchase_order.partner_ref}
            },
        })

    def _ubl_add_line_item_name_description_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._ubl_add_line_item_name_description_nodes(vals)
        if not self._is_document(vals, 'order'):
            return

        item_node = vals['item_node']
        base_line = vals['line_vals']['base_line']
        supplier_info = base_line['supplier_info']
        if supplier_info.product_name:
            item_node['cbc:Name'] = {'_text': supplier_info.product_name}

    def _ubl_add_line_item_identification_nodes(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        super()._ubl_add_line_item_identification_nodes(vals)
        if not self._is_document(vals, 'order'):
            return

        item_node = vals['item_node']
        base_line = vals['line_vals']['base_line']
        product = base_line['product_id']

        item_node['cac:BuyersItemIdentification'] = {
            'cbc:ID': {'_text': product.default_code or product.id},
        }

        # When generating purchase order (PO) we are not considered as the seller of the sale but
        # buyer. The `SellersItemIdentification` is therefore the PO's partner product ID.
        supplier_info = base_line['supplier_info']
        item_node['cac:SellersItemIdentification'] = {
            'cbc:ID': {'_text': supplier_info.product_code or None},
        }

    # -------------------------------------------------------------------------
    # Purchase Order EDI Import
    # -------------------------------------------------------------------------

    def _retrieve_order_vals(self, order, tree):
        # EXTENDS account.edi.ubl_order
        order_vals, logs = super()._retrieve_order_vals(order, tree)
        partner, partner_logs = self._import_partner(
            order.company_id,
            **self._import_retrieve_partner_vals(tree, 'SellerSupplier'),
        )
        if partner:
            order_vals['partner_id'] = partner.id
        order_vals['partner_ref'] = tree.findtext('./{*}ID')
        order_vals['origin'] = tree.findtext('./{*}OriginatorDocumentReference/{*}ID')

        delivery_partner, delivery_logs = self._import_partner(
            order.company_id,
            **self._import_retrieve_partner_vals(tree, 'Delivery'),
        )
        if delivery_partner:
            order_vals['dest_address_id'] = delivery_partner.id

        allowance_charges_line_vals, allowance_charges_logs = self._import_document_allowance_charges(tree, order, 'purchase')
        lines_vals, line_logs = self._import_lines(order, tree, './{*}OrderLine/{*}LineItem', document_type='order', tax_type='purchase')
        # adapt each line to purchase.order.line
        for line in lines_vals:
            if line.get('product_uom_id'):
                line['uom_id'] = line.pop('product_uom_id')
            if not line.get('product_id'):
                line_logs.append(_("Could not retrieve the product named: %(name)s", name=line['name']))
        lines_vals += allowance_charges_line_vals

        # Update order with lines excluding discounts
        order_vals['order_line'] = [Command.create(line_vals) for line_vals in lines_vals]
        logs += partner_logs + delivery_logs + line_logs + allowance_charges_logs

        return order_vals, logs

    def _retrieve_line_vals(self, record, tree, document_type=False, qty_factor=1):
        """Override of `account.edi.ubl_order` to adapt dictionary keys from the base method to be
        compatible with the `purchase.order.line` model."""
        line_vals = super()._retrieve_line_vals(record, tree, document_type, qty_factor)
        line_vals['product_qty'] = line_vals.pop('quantity')
        return line_vals
