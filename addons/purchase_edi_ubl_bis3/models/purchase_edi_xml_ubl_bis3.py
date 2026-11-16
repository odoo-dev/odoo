from lxml import etree

from odoo import models, Command, _
from odoo.tools import html2plaintext
from odoo.tools.partner_identifiers import get_tin_metadata_of_country
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt
from odoo.addons.account_edi_ubl.models.account_edi_ubl import UBL_NAMESPACES
from odoo.addons.account_edi_ubl.tools import Order


class PurchaseEdiXmlUbl_Bis3(models.AbstractModel):
    _name = 'purchase.edi.xml.ubl_bis3'
    _inherit = ['account.edi.xml.ubl_bis3']
    _description = "Purchase UBL BIS Ordering 3.5"

    # -------------------------------------------------------------------------
    # Purchase Order EDI Export
    # -------------------------------------------------------------------------

    def _export_order(self, purchase_order):
        vals = self._init_order_export_values(purchase_order)
        self._export_order_document(vals)
        document_node = vals['document_node']
        xml_content = dict_to_xml(document_node, template=document_node['_template'], nsmap=document_node['_nsmap'])
        return etree.tostring(xml_content, xml_declaration=True, encoding='UTF-8')

    def _init_order_export_values(self, purchase_order):
        """ The neutral values of the Peppol Order transaction (same keys as '_init_invoice_export_values'). """
        company = purchase_order.company_id
        supplier, customer, delivery = self._order_get_parties(purchase_order)
        vals = {
            'purchase_order': purchase_order,
            'company': company,
            'currency': purchase_order.currency_id,
            'company_currency': company.currency_id,
            'supplier': supplier,
            'customer': customer,
            'delivery': delivery,
        }
        self._define_document_type(vals, 'order')
        self._order_prepare_base_lines(vals)
        return vals

    def _order_prepare_base_lines(self, vals):
        AccountTax = self.env['account.tax']
        purchase_order = vals['purchase_order']
        company = vals['company']
        base_lines = vals['base_lines'] = [line._prepare_base_line_for_taxes_computation() for line in purchase_order.order_line.filtered(lambda line: not line.display_type)]
        AccountTax._add_tax_details_in_base_lines(base_lines, company)
        AccountTax._round_base_lines_tax_details(base_lines, company)

        # CEN-EN16931 layer.
        # [BR-27]-The Item net price (BT-146) shall NOT be negative.
        self._turn_price_unit_positive(vals)

        # PINT layer.
        # Manage taxes for emptying.
        vals['base_lines'] = self._turn_emptying_taxes_as_new_base_lines(
            base_lines=vals['base_lines'],
            company=company,
            vals=vals,
        )

        # Sub-dictionaries to store UBL-related values along the whole process.
        vals['_ubl_values'] = {}
        for base_line in vals['base_lines']:
            base_line['_ubl_values'] = {}

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

        # Global rounding of tax_details using 6 digits.
        self._round_base_lines_tax_details(vals)

    def _fill_nsmap_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_nsmap_values(vals)
        if self._is_document(vals, 'order'):
            vals['document_node']['_nsmap'][None] = "urn:oasis:names:specification:ubl:schema:xsd:Order-2"

    def _fill_template_values(self, vals):
        # EXTENDS account.edi.ubl
        super()._fill_template_values(vals)
        if self._is_document(vals, 'order'):
            vals['document_node']['_template'] = Order

    def _export_order_document(self, vals):
        vals['document_node'] = {'_nsmap': {}, '_template': Order}
        self._fill_template_values(vals)
        self._fill_nsmap_values(vals)
        self._order_add_header_nodes(vals)
        self._ubl_add_buyer_customer_party_node(vals)
        self._ubl_add_seller_supplier_party_node(vals)
        self._order_add_delivery_nodes(vals)
        self._order_add_payment_terms_nodes(vals)
        self._order_add_line_nodes(vals)
        self._order_add_allowance_charge_nodes(vals)
        self._ubl_add_tax_totals_nodes(vals)
        self._ubl_add_anticipated_monetary_total_node(vals)
        return vals

    def _order_get_parties(self, purchase_order):
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
        purchase_order = vals['purchase_order']
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

    def _ubl_get_delivery_node_from_delivery_address(self, vals):
        # EXTENDS account.edi.xml.ubl_bis3
        node = super()._ubl_get_delivery_node_from_delivery_address(vals)
        if self._is_document(vals, 'order'):
            node['cbc:ActualDeliveryDate'] = None
            node['cac:DeliveryLocation'] = None
        return node

    def _order_add_delivery_nodes(self, vals):
        self._ubl_add_delivery_nodes(vals)
        # A single Delivery in the Peppol Order.
        document_node = vals['document_node']
        document_node['cac:Delivery'] = document_node['cac:Delivery'][0] if document_node['cac:Delivery'] else None

    def _order_add_payment_terms_nodes(self, vals):
        purchase_order = vals['purchase_order']
        vals['document_node']['cac:PaymentTerms'] = {
            'cbc:Note': {'_text': purchase_order.payment_term_id.name},
        } if purchase_order.payment_term_id else None

    def _order_add_allowance_charge_nodes(self, vals):
        self._ubl_add_allowance_charge_nodes(vals)

        # Early payment discount lines are treated as allowances/charges.
        self._ubl_add_allowance_charge_nodes_early_payment_discount(vals)

    def _ubl_add_legal_monetary_total_line_extension_amount_node(self, vals, in_foreign_currency=True):
        # EXTENDS account.edi.ubl
        if not self._is_document(vals, 'order'):
            return super()._ubl_add_legal_monetary_total_line_extension_amount_node(vals, in_foreign_currency=in_foreign_currency)

        currency = vals['currency'] if in_foreign_currency else vals['company_currency']
        line_extension_amount = sum(
            line_node['cac:LineItem']['cbc:LineExtensionAmount']['_text']
            for line_node in vals['document_node'].get('cac:OrderLine', [])
        )
        vals['legal_monetary_total_node']['cbc:LineExtensionAmount'] = {
            '_text': FloatFmt(line_extension_amount, min_dp=currency.decimal_places),
            'currencyID': currency.name,
        }

    def _ubl_add_anticipated_monetary_total_node(self, vals):
        node = vals['document_node']['cac:AnticipatedMonetaryTotal'] = {}
        sub_vals = {**vals, 'legal_monetary_total_node': node}
        self._ubl_add_legal_monetary_total_line_extension_amount_node(sub_vals)
        self._ubl_add_legal_monetary_total_tax_exclusive_amount_node(sub_vals)
        self._ubl_add_legal_monetary_total_tax_inclusive_amount_node(sub_vals)
        self._ubl_add_legal_monetary_total_allowance_charge_total_amount_node(sub_vals)
        self._ubl_add_legal_monetary_total_payable_rounding_amount_node(sub_vals)
        self._ubl_add_legal_monetary_total_prepaid_payable_amount_node(sub_vals)

    def _order_add_line_node(self, vals):
        self._ubl_add_line_id_node(vals)
        self._ubl_add_line_allowance_charge_nodes(vals)
        self._ubl_add_line_quantity_node(vals)
        self._ubl_add_line_extension_amount_node(vals)
        self._ubl_add_line_item_node(vals)
        self._ubl_add_line_price_node(vals)

    def _order_add_line_nodes(self, vals):
        nodes = vals['document_node']['cac:OrderLine'] = []
        for index, base_line in enumerate(vals['base_lines'], start=1):
            sub_vals = {
                **vals,
                'line_vals': {'base_line': base_line, 'index': index},
                'line_node': {},
            }
            self._order_add_line_node(sub_vals)
            nodes.append({'cac:LineItem': sub_vals['line_node']})

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

    def _ubl_get_line_allowance_charge_discount_node(self, vals, discount_values):
        # EXTENDS account.edi.xml.ubl_bis3
        discount_node = super()._ubl_get_line_allowance_charge_discount_node(vals, discount_values)
        if self._is_document(vals, 'order'):
            discount_node['cbc:AllowanceChargeReason'] = None
            discount_node['cbc:MultiplierFactorNumeric'] = None
            discount_node['cbc:BaseAmount'] = None
        return discount_node

    # -------------------------------------------------------------------------
    # Order EDI Import: xpaths/partner values used by the legacy import helpers of account.edi.common
    # (formerly defined on account.edi.xml.ubl_20 / ubl_bis3)
    # -------------------------------------------------------------------------

    def _import_retrieve_partner_vals(self, tree, role):
        """ Returns a dict of values that will be used to retrieve the partner """
        vat = self._find_value(f'.//cac:{role}Party//cbc:CompanyID[string-length(text()) > 5]', tree)
        country_code = self._find_value(f'.//cac:{role}Party//cac:PostalAddress/cac:Country/cbc:IdentificationCode', tree)
        if not vat and country_code and (vat_scheme := get_tin_metadata_of_country(country_code).get('scheme')):
            vat = self._find_value(f".//cac:{role}Party//cac:PartyIdentification/cbc:ID[@schemeID='{vat_scheme}']", tree)

        partner_vals = {
            'vat': vat,
            'phone': self._find_value(f'.//cac:{role}Party//cac:Contact/cbc:Telephone', tree),
            'email': self._find_value(f'.//cac:{role}Party//cac:Contact/cbc:ElectronicMail', tree),
            'name': self._find_value(f'.//cac:{role}Party//cac:PartyTaxScheme/cbc:RegistrationName', tree) or
                    self._find_value(f'.//cac:{role}Party//cac:PartyLegalEntity/cbc:RegistrationName', tree) or
                    self._find_value(f'.//cac:{role}Party//cac:PartyName/cbc:Name', tree) or
                    self._find_value(f'.//cac:{role}Party//cac:Contact/cbc:Name', tree),
            'postal_address': {
                'country_code': country_code,
                'street': self._find_value(f'.//cac:{role}Party//cac:PostalAddress/cbc:StreetName', tree),
                'additional_street': self._find_value(f'.//cac:{role}Party//cac:PostalAddress/cbc:AdditionalStreetName', tree),
                'city': self._find_value(f'.//cac:{role}Party//cac:PostalAddress/cbc:CityName', tree),
                'zip': self._find_value(f'.//cac:{role}Party//cac:PostalAddress/cbc:PostalZone', tree),
                'state_code': self._find_value(f'.//cac:{role}Party//cac:PostalAddress/cbc:CountrySubentityCode', tree),
            },
        }

        endpoint_node = tree.find(f'.//cac:{role}Party/cac:Party/cbc:EndpointID', UBL_NAMESPACES)
        if endpoint_node is not None:
            ResPartner = self.env['res.partner']
            scheme = endpoint_node.attrib.get('schemeID')
            value = endpoint_node.text
            if scheme and value:
                meta = ResPartner._get_all_identifiers_metadata_by_scheme().get(scheme)
                # Skip an endpoint whose value is malformed.
                if not meta or ResPartner._validate_identifier(meta['key'], value)['valid']:
                    partner_vals['routing_scheme'] = scheme
                    partner_vals['routing_endpoint'] = value
                    if meta and meta['key'] in ResPartner._get_all_additional_identifiers_metadata():
                        partner_vals.setdefault('additional_identifiers', {})[meta['key']] = value
                elif partner_vals.get('vat') == value:
                    # VAT is malformed: clear that bogus vat
                    partner_vals['vat'] = None
        return partner_vals

    def _get_document_allowance_charge_xpaths(self):
        # EXTENDS account.edi.common
        return {
            'root': './{*}AllowanceCharge',
            'charge_indicator': './{*}ChargeIndicator',
            'base_amount': './{*}BaseAmount',
            'amount': './{*}Amount',
            'reason': './{*}AllowanceChargeReason',
            'percentage': './{*}MultiplierFactorNumeric',
            'tax_percentage': './{*}TaxCategory/{*}Percent',
        }

    def _get_tax_nodes(self, tree):
        tax_nodes = tree.findall('.//{*}Item/{*}ClassifiedTaxCategory/{*}Percent')
        if not tax_nodes:
            for elem in tree.findall('.//{*}TaxTotal'):
                percentage_nodes = elem.findall('.//{*}TaxSubtotal/{*}TaxCategory/{*}Percent')
                if not percentage_nodes:
                    percentage_nodes = elem.findall('.//{*}TaxSubtotal/{*}Percent')
                tax_nodes += percentage_nodes
        return tax_nodes

    def _get_invoice_line_xpaths(self, document_type=False, qty_factor=1):
        # EXTENDS account.edi.common
        return {
            'deferred_start_date': './{*}InvoicePeriod/{*}StartDate',
            'deferred_end_date': './{*}InvoicePeriod/{*}EndDate',
            'date_format': '%Y-%m-%d',
        }

    def _get_line_xpaths(self, document_type=False, qty_factor=1):
        return {
            'basis_qty': './cac:Price/cbc:BaseQuantity',
            'gross_price_unit': './{*}Price/{*}AllowanceCharge/{*}BaseAmount',
            'rebate': './{*}Price/{*}AllowanceCharge/{*}Amount',
            'net_price_unit': './{*}Price/{*}PriceAmount',
            'allowance_charge': './/{*}AllowanceCharge',
            'allowance_charge_indicator': './{*}ChargeIndicator',
            'allowance_charge_amount': './{*}Amount',
            'allowance_charge_reason': './{*}AllowanceChargeReason',
            'allowance_charge_reason_code': './{*}AllowanceChargeReasonCode',
            'line_total_amount': './{*}LineExtensionAmount',
            'name': [
                './cac:Item/cbc:Description',
                './cac:Item/cbc:Name',
            ],
            'product': self._get_product_xpaths(),
            'delivered_qty': './{*}Quantity',
        }

    def _get_product_xpaths(self):
        return {
            'default_code': './cac:Item/cac:SellersItemIdentification/cbc:ID',
            'name': './cac:Item/cbc:Name',
            'barcode': './cac:Item/cac:StandardItemIdentification/cbc:ID',
        }

    # -------------------------------------------------------------------------
    # Purchase Order EDI Import
    # -------------------------------------------------------------------------

    def _retrieve_order_vals(self, order, tree):
        """ Fill order details by extracting details from xml tree.
        param order: Order to fill details from xml tree.
        param tree: Xml tree to extract details.
        :return: list of logs to add warning and information about data from xml.
        """
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
            # line level charges do not have product_uom_id
            if line.get('product_uom_id'):
                line['uom_id'] = line.pop('product_uom_id')
            # remove invoice line fields
            line.pop('deferred_start_date', False)
            line.pop('deferred_end_date', False)
            if not line.get('product_id'):
                line_logs.append(_("Could not retrieve the product named: %(name)s", name=line['name']))
        lines_vals += allowance_charges_line_vals

        # Update order with lines excluding discounts
        order_vals['order_line'] = [Command.create(line_vals) for line_vals in lines_vals]
        logs += partner_logs + delivery_logs + line_logs + allowance_charges_logs

        return order_vals, logs

    def _retrieve_line_vals(self, record, tree, document_type=False, qty_factor=1):
        """Override of `account.edi.common` to adapt dictionary keys from the base method to be
        compatible with the `purchase.order.line` model."""
        line_vals = super()._retrieve_line_vals(record, tree, document_type, qty_factor)
        line_vals['product_qty'] = line_vals.pop('quantity')
        return line_vals
