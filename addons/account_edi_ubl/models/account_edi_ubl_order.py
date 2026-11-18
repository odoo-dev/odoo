import re

from lxml import etree
from markupsafe import Markup

from odoo import _, api, models
from odoo.tools import float_compare, float_is_zero
from odoo.tools.misc import html_escape
from odoo.tools.partner_identifiers import get_tin_metadata_of_country
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.models.account_edi_common import FloatFmt
from odoo.addons.account_edi_ubl.models.account_edi_ubl import UBL_NAMESPACES
from odoo.addons.account_edi_ubl.tools import Order


class AccountEdiUblOrder(models.AbstractModel):
    """ Peppol BIS Ordering 3 - Order transaction, shared by the sale and purchase modules.

    * Specification: https://docs.peppol.eu/poacc/upgrade-3/syntax/Order/tree/

    The neutral export values are the ones of the invoices (see '_init_invoice_export_values'), with the sale/purchase
    order under the 'order' key. The children ('sale.edi.xml.ubl_bis3', 'purchase.edi.xml.ubl_bis3') provide the
    parties ('_order_get_parties'), the header nodes ('_order_add_header_nodes') and the import of the order values
    ('_retrieve_order_vals').
    """
    _name = 'account.edi.ubl_order'
    _inherit = ['account.edi.xml.ubl_bis3']
    _description = "Peppol BIS Ordering 3"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_order(self, order):
        vals = self._init_order_export_values(order)
        self._export_order_document(vals)
        document_node = vals['document_node']
        xml_content = dict_to_xml(document_node, template=document_node['_template'], nsmap=document_node['_nsmap'])
        return etree.tostring(xml_content, xml_declaration=True, encoding='UTF-8')

    def _init_order_export_values(self, order):
        """ The neutral values of the Peppol Order transaction (same keys as '_init_invoice_export_values'). """
        company = order.company_id
        supplier, customer, delivery = self._order_get_parties(order)
        vals = {
            'order': order,
            'company': company,
            'currency': order.currency_id,
            'company_currency': company.currency_id,
            'supplier': supplier,
            'customer': customer,
            'delivery': delivery,
        }
        self._define_document_type(vals, 'order')
        self._order_prepare_base_lines(vals)
        return vals

    def _order_get_parties(self, order):
        """ The (supplier, customer, delivery) partners of the order. To be implemented by the children. """
        raise NotImplementedError()

    def _order_prepare_base_lines(self, vals):
        AccountTax = self.env['account.tax']
        order = vals['order']
        company = vals['company']
        base_lines = vals['base_lines'] = [line._prepare_base_line_for_taxes_computation() for line in order.order_line.filtered(lambda line: not line.display_type)]
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

    def _order_add_header_nodes(self, vals):
        """ The header nodes (CustomizationID, ID, IssueDate, OrderTypeCode, ...). To be implemented by the children. """
        raise NotImplementedError()

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
        order = vals['order']
        vals['document_node']['cac:PaymentTerms'] = {
            'cbc:Note': {'_text': order.payment_term_id.name},
        } if order.payment_term_id else None

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

    def _ubl_get_line_allowance_charge_discount_node(self, vals, discount_values):
        # EXTENDS account.edi.xml.ubl_bis3
        discount_node = super()._ubl_get_line_allowance_charge_discount_node(vals, discount_values)
        if self._is_document(vals, 'order'):
            discount_node['cbc:AllowanceChargeReason'] = None
            discount_node['cbc:MultiplierFactorNumeric'] = None
            discount_node['cbc:BaseAmount'] = None
        return discount_node

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _import_order_ubl(self, order, file_data, new):
        """ Decoder of the Peppol Order files (see sale/purchase.order._get_edi_decoder): fill ``order`` from
        ``file_data``.
        """
        tree = file_data['xml_tree']

        # Update the order.
        order_vals, logs = self._retrieve_order_vals(order, tree)
        if order:
            order.write(order_vals)
            order.message_post(body=Markup("<strong>%s</strong>") % _("Format used to import the document: %s", self._description))
            if logs:
                order._create_activity_set_details(Markup("<ul>%s</ul>") % Markup().join(Markup("<li>%s</li>") % l for l in logs))

    def _retrieve_order_vals(self, order, tree):
        """ Extract the order values from the xml tree.

        :param order: The order to fill.
        :param tree: The xml tree.
        :return: The values to write on the order, and the list of logs (warnings about the data of the xml).
        """
        order_vals = {}
        logs = []

        order_vals['date_order'] = tree.findtext('.//{*}EndDate') or tree.findtext('.//{*}IssueDate')
        order_vals['note'] = self._import_description(tree, xpaths=['./{*}Note'])
        order_vals['payment_term_id'] = self._import_order_payment_terms_id(order.company_id, tree, './/cac:PaymentTerms/cbc:Note')
        order_vals['currency_id'], currency_logs = self._import_currency(tree, './/{*}DocumentCurrencyCode')

        logs += currency_logs
        return order_vals, logs

    def _import_order_payment_terms_id(self, company_id, tree, xpath):
        """ Return payment term name from given tree and try to find a match. """
        payment_term_name = self._find_value(xpath, tree)
        if not payment_term_name:
            return False
        payment_term_domain = self.env['account.payment.term']._check_company_domain(company_id)
        payment_term_domain.append(('name', '=', payment_term_name))
        return self.env['account.payment.term'].search(payment_term_domain, limit=1)

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

    def _get_product_xpaths(self):
        """ The xpaths of the product values of an order line (see 'product.product._retrieve_product'). """
        return {
            'default_code': './cac:Item/cac:SellersItemIdentification/cbc:ID',
            'name': './cac:Item/cbc:Name',
            'barcode': './cac:Item/cac:StandardItemIdentification/cbc:ID',
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

    def _import_document_allowance_charges(self, tree, record, tax_type, qty_factor=1):
        logs = []
        xpaths = self._get_document_allowance_charge_xpaths()
        line_vals = []
        for allow_el in tree.iterfind(xpaths['root']):
            name = allow_el.findtext(xpaths['reason']) or ""
            # Charge indicator factor: -1 for discount, 1 for charge
            charge_indicator = -1 if allow_el.findtext(xpaths['charge_indicator']).lower() == 'false' else 1
            amount = float(allow_el.findtext(xpaths['amount']) or 0)
            base_amount = float(allow_el.findtext(xpaths['base_amount']) or 0)
            if base_amount:
                price_unit = base_amount * charge_indicator * qty_factor
                percentage = float(allow_el.findtext(xpaths['percentage']) or 100)
                quantity = percentage / 100
            else:
                price_unit = amount * charge_indicator * qty_factor
                quantity = 1

            # Taxes
            tax_ids = []
            for tax_percent_node in allow_el.iterfind(xpaths['tax_percentage']):
                tax_amount = float(tax_percent_node.text)
                tax = self.env['account.tax'].search([
                    *self.env['account.tax']._check_company_domain(record.company_id),
                    ('amount', '=', tax_amount),
                    ('amount_type', '=', 'percent'),
                    ('type_tax_use', '=', tax_type),
                ], limit=1)
                if tax:
                    tax_ids += tax.ids
                elif name:
                    logs.append(_(
                        "Could not retrieve the tax: %(tax_percentage)s %% for line '%(line)s'.",
                        tax_percentage=tax_amount,
                        line=name,
                    ))
                else:
                    logs.append(
                        _("Could not retrieve the tax: %s for the document level allowance/charge.", tax_amount))

            line_vals.append([name, quantity, price_unit, tax_ids])
        return record._get_line_vals_list(line_vals), logs

    def _import_currency(self, tree, xpath):
        logs = []
        currency_name = tree.findtext(xpath)
        currency = self.env.company.currency_id
        if currency_name is not None:
            currency = currency.with_context(active_test=False).search([
                ('name', '=', currency_name),
            ], limit=1)
            if currency:
                if not currency.active:
                    logs.append(_("The currency '%s' is not active.", currency.name))
            else:
                logs.append(_("Could not retrieve currency: %s. Did you enable the multicurrency option "
                              "and activate the currency?", currency_name))
        return currency.id, logs

    def _import_description(self, tree, xpaths):
        description = ""
        for xpath in xpaths:
            note = tree.findtext(xpath)
            if note:
                description += f"<p>{html_escape(note)}</p>"
        return description

    def _import_lines(self, record, tree, xpath, document_type=False, tax_type=False, qty_factor=1):
        logs = []
        lines_values = []
        for line_tree in tree.iterfind(xpath):
            line_values = self.with_company(record.company_id)._retrieve_line_vals(record, line_tree, document_type, qty_factor)
            if not line_values.get('price_subtotal'):
                continue

            line_values['tax_ids'], tax_logs = self._retrieve_taxes(record, line_values, tax_type)
            logs += tax_logs
            if not line_values['product_uom_id']:
                line_values.pop('product_uom_id')  # if no uom, pop it so it's inferred from the product_id
            lines_values.append(line_values)
            self._retrieve_line_charges(record, line_values, line_values['tax_ids'])
        return lines_values, logs

    @api.model
    def _retrieve_rebate_val(self, tree, xpath_dict, quantity):
        # Discount. /!\ as no percent discount can be set on a line, need to infer the percentage
        # from the amount of the actual amount of the discount (the allowance charge)
        rebate = 0
        rebate_node = tree.find(xpath_dict['rebate'])
        net_price_unit_node = tree.find(xpath_dict['net_price_unit'])
        gross_price_unit_node = tree.find(xpath_dict['gross_price_unit'])
        if rebate_node is not None:
            rebate = float(rebate_node.text)
        elif net_price_unit_node is not None and gross_price_unit_node is not None:
            rebate = float(gross_price_unit_node.text) - float(net_price_unit_node.text)
        return rebate

    @api.model
    def _retrieve_charge_allowance_vals(self, tree, xpath_dict, quantity):
        charges = []
        discount_amount = 0
        for allowance_charge_node in tree.iterfind(xpath_dict['allowance_charge']):
            charge_indicator = allowance_charge_node.findtext(xpath_dict['allowance_charge_indicator']) or 'false'
            amount = float(allowance_charge_node.findtext(xpath_dict['allowance_charge_amount'], default='0'))
            reason_code = allowance_charge_node.findtext(xpath_dict['allowance_charge_reason_code'], default='')
            reason = allowance_charge_node.findtext(xpath_dict['allowance_charge_reason'], default='')
            if charge_indicator.lower() == 'true':
                charges.append({
                    'amount': amount,
                    'line_quantity': quantity,
                    'reason': reason,
                    'reason_code': reason_code,
                })
            else:
                discount_amount += amount
        return discount_amount, charges

    def _get_basis_qty(self, tree, xpath_dict):
        """ Return the base quantity used to derive the unit price from PriceAmount.
        The standard UBL/CII divides PriceAmount by BaseQuantity to obtain the unit price upon
        import.
        """
        return float(self._find_value(xpath_dict['basis_qty'], tree) or 1) or 1.0

    def _retrieve_line_vals(self, record, tree, document_type=False, qty_factor=1):
        """
        Read the xml invoice, extract the invoice line values, compute the odoo values
        to fill an invoice line form: quantity, price_unit, discount, product_uom_id.

        The way of computing invoice line is quite complicated:
        https://docs.peppol.eu/poacc/billing/3.0/bis/#_calculation_on_line_level (same as in factur-x documentation)

        line_net_subtotal = ( gross_unit_price - rebate ) * (delivered_qty / basis_qty) - allow_charge_amount

        with (UBL | CII):
            * net_unit_price = 'Price/PriceAmount' | 'NetPriceProductTradePrice' (mandatory) (BT-146)
            * gross_unit_price = 'Price/AllowanceCharge/BaseAmount' | 'GrossPriceProductTradePrice' (optional) (BT-148)
            * basis_qty = 'Price/BaseQuantity' | 'BasisQuantity' (optional, either below net_price node or
                gross_price node) (BT-149)
            * delivered_qty = 'InvoicedQuantity' (invoice) | 'BilledQuantity' (bill) | 'Quantity' (order) (mandatory) (BT-129)
            * allow_charge_amount = sum of 'AllowanceCharge' | 'SpecifiedTradeAllowanceCharge' (same level as Price)
                ON THE LINE level (optional) (BT-136 / BT-141)
            * line_net_subtotal = 'LineExtensionAmount' | 'LineTotalAmount' (mandatory) (BT-131)
            * rebate = 'Price/AllowanceCharge' | 'AppliedTradeAllowanceCharge' below gross_price node ! (BT-147)
                "item price discount" which is different from the usual allow_charge_amount
                gross_unit_price (BT-148) - rebate (BT-147) = net_unit_price (BT-146)

        In Odoo, we obtain:
        (1) = price_unit  =  gross_price_unit / basis_qty  =  (net_price_unit + rebate) / basis_qty
        (2) = quantity  =  delivered_qty
        (3) = discount (converted into a percentage)  =  100 * (1 - price_subtotal / (delivered_qty * price_unit))
        (4) = price_subtotal

        Alternatively, we could also set: quantity = delivered_qty/basis_qty

        WARNING, the basis quantity parameter is annoying, for instance, an invoice with a line:
            item A  | price per unit of measure/unit price: 30  | uom = 3 pieces | billed qty = 3 | rebate = 2  | untaxed total = 28
        Indeed, 30 $ / 3 pieces = 10 $ / piece => 10 * 3 (billed quantity) - 2 (rebate) = 28

        UBL ROUNDING: "the result of Item line net
            amount = ((Item net price (BT-146)÷Item price base quantity (BT-149))×(Invoiced Quantity (BT-129))
        must be rounded to two decimals, and the allowance/charge amounts are also rounded separately."
        It is not possible to do it in Odoo.
        """
        xpath_dict = self._get_line_xpaths(document_type, qty_factor)
        # basis_qty (optional)
        basis_qty = self._get_basis_qty(tree, xpath_dict)

        # gross_price_unit (optional)
        gross_price_unit = None
        gross_price_unit_node = tree.find(xpath_dict['gross_price_unit'])
        if gross_price_unit_node is not None:
            gross_price_unit = float(gross_price_unit_node.text)

        # net_price_unit (mandatory)
        net_price_unit = None
        net_price_unit_node = tree.find(xpath_dict['net_price_unit'])
        if net_price_unit_node is not None:
            net_price_unit = float(net_price_unit_node.text)

        # delivered_qty (mandatory)
        delivered_qty = 1
        product_vals = {k: self._find_value(v, tree) for k, v in xpath_dict['product'].items()}
        product = self._import_product(record.partner_id, **product_vals)
        product_uom = self.env['uom.uom']
        quantity_node = tree.find(xpath_dict['delivered_qty'])
        if quantity_node is not None:
            delivered_qty = float(quantity_node.text)
            if unece_code := quantity_node.attrib.get('unitCode'):
                product_uom = self.env['uom.uom']._get_uom_from_unece_code(unece_code)
        if product and product_uom and not product_uom._has_common_reference(product.product_tmpl_id.uom_id):
            # uom incompatibility
            product_uom = self.env['uom.uom']

        # line_net_subtotal (mandatory)
        price_subtotal = None
        line_total_amount_node = tree.find(xpath_dict['line_total_amount'])
        if line_total_amount_node is not None and line_total_amount_node.text and line_total_amount_node.text.strip():
            price_subtotal = float(line_total_amount_node.text)

        # quantity
        quantity = delivered_qty * qty_factor

        # rebate (optional)
        rebate = self._retrieve_rebate_val(tree, xpath_dict, quantity)

        # Charges are collected (they are used to create new lines), Allowances are transformed into discounts
        discount_amount, charges = self._retrieve_charge_allowance_vals(tree, xpath_dict, quantity)

        # price_unit
        charge_amount = sum(d['amount'] for d in charges)
        allow_charge_amount = discount_amount - charge_amount
        if gross_price_unit is not None:
            price_unit = gross_price_unit / basis_qty
        elif net_price_unit is not None:
            price_unit = (net_price_unit + rebate) / basis_qty
        elif price_subtotal is not None:
            price_unit = (price_subtotal + allow_charge_amount) / (delivered_qty or 1)
        else:
            price_unit = 0

        # discount
        discount = 0
        currency = self.env.company.currency_id
        if not float_is_zero(delivered_qty * price_unit, currency.decimal_places) and price_subtotal is not None:
            inferred_discount = 100 * (1 - (price_subtotal - charge_amount) / currency.round(delivered_qty * price_unit))
            discount = inferred_discount if not float_is_zero(inferred_discount, currency.decimal_places) else 0.0

        # Sometimes, the xml received is very bad; e.g.:
        #   * unit price = 0, qty = 0, but price_subtotal = -200
        #   * unit price = 0, qty = 1, but price_subtotal = -200
        #   * unit price = 1, qty = 0, but price_subtotal = -200
        # for instance, when filling a down payment as an document line. The equation in the docstring is not
        # respected, and the result will not be correct, so we just follow the simple rule below:
        if (
            net_price_unit is not None
            and price_subtotal is not None
            and float_compare(price_subtotal, net_price_unit * (delivered_qty / basis_qty) - allow_charge_amount, currency.decimal_places)
        ):
            if net_price_unit == 0 and delivered_qty == 0:
                quantity = 1
                price_unit = price_subtotal
            elif net_price_unit == 0:
                price_unit = price_subtotal / delivered_qty
            elif delivered_qty == 0:
                quantity = price_subtotal / price_unit

        line_vals = {
            # vals to be written on the document line
            'product_id': product.id,
            'product_uom_id': product_uom.id,
            'price_unit': price_unit,
            'quantity': quantity,
            'discount': discount,
            'tax_nodes': self._get_tax_nodes(tree),  # see `_retrieve_taxes`
            'charges': charges,  # see `_retrieve_line_charges`
            'price_subtotal': price_subtotal,
        }

        name = self._find_value(xpath_dict['name'], tree) or ''
        if product:
            name = re.sub(rf"^{re.escape(product.name)}($|\n)", "", name)

        if name:
            line_vals['name'] = name

        return line_vals

    def _get_line_label(self, line_values):
        product = self.env['product.product'].browse(line_values.get('product_id'))
        return ' '.join(filter(None, [product.name, line_values.get('name')]))

    def _import_product(self, partner, **product_vals):
        return self.env['product.product']._retrieve_product(**product_vals)

    def _retrieve_fixed_tax(self, company_id, fixed_tax_vals):
        """ Retrieve the fixed tax at import, iteratively search for a tax:
        1. not price_include matching the name and the amount
        2. not price_include matching the amount
        3. price_include matching the name and the amount
        4. price_include matching the amount
        """
        base_domain = [
            *self.env['account.journal']._check_company_domain(company_id),
            ('amount_type', '=', 'fixed'),
            ('amount', '=', fixed_tax_vals['amount']),
        ]
        for price_include in (False, True):
            for name in (fixed_tax_vals['reason'], False):
                domain = base_domain + [('price_include', '=', price_include)]
                if name:
                    domain.append(('name', '=', name))
                tax = self.env['account.tax'].search(domain, limit=1)
                if tax:
                    return tax
        return self.env['account.tax']

    def _retrieve_taxes(self, record, line_values, tax_type):
        """
        Retrieve the taxes on the document line at import.

        In a UBL/CII xml, the Odoo "price_include" concept does not exist. Hence, first look for a price_include=False,
        if it is unsuccessful, look for a price_include=True.
        """
        # Taxes: all amounts are tax excluded, so first try to fetch price_include=False taxes,
        # if no results, try to fetch the price_include=True taxes. If results, need to adapt the price_unit.
        logs = []
        taxes = []
        fpos_domain = [('fiscal_position_ids', '=', record.fiscal_position_id.id)]
        if record.fiscal_position_id.is_domestic:
            fpos_domain = ['|', ('fiscal_position_ids', '=', False)] + fpos_domain
        line_label = self._get_line_label(line_values)
        for tax_node in line_values.pop('tax_nodes'):
            amount = float(tax_node.text)
            domain = [
                *self.env['account.journal']._check_company_domain(record.company_id),
                ('amount_type', '=', 'percent'),
                ('type_tax_use', '=', tax_type),
                ('amount', '=', amount),
            ]
            tax = self.env['account.tax'].search(domain + fpos_domain + [('price_include', '=', False)], limit=1)
            if not tax:
                tax = self.env['account.tax'].search(domain + fpos_domain + [('price_include', '=', True)], limit=1)
            if not tax:
                tax = self.env['account.tax'].search(domain + [('price_include', '=', False)], limit=1)
            if not tax:
                tax = self.env['account.tax'].search(domain + [('price_include', '=', True)], limit=1)

            if not tax:
                logs.append(
                    _("Could not retrieve the tax: %(amount)s %% for line '%(line)s'.",
                    amount=amount,
                    line=line_label),
                )
            else:
                taxes.append(tax.id)
                if tax.price_include:
                    line_values['price_unit'] *= (1 + tax.amount / 100)
        return taxes, logs

    def _retrieve_line_charges(self, record, line_values, taxes):
        """
        Handle the charges on the document line at import: they are included in the price unit of the line.

        Special case: if the ReasonCode == 'AEO', there is a high chance the xml was produced by Odoo and the
        corresponding line had a fixed tax, so it first tries to find a matching fixed tax to apply to the current aml.
        """
        for charge in line_values.pop('charges'):
            if not charge['line_quantity']:
                continue

            if charge['reason_code'] == 'AEO':
                # a 1 eur fixed tax on a line with quantity=2 will yield an AllowanceCharge with amount = 2
                charge_copy = charge.copy()
                charge_copy['amount'] /= charge_copy['line_quantity']
                if tax := self._retrieve_fixed_tax(record.company_id, charge_copy):
                    taxes.append(tax.id)
                    if tax.price_include:
                        line_values['price_unit'] += tax.amount
                    continue

            price_subtotal_before = line_values['price_unit'] * charge['line_quantity'] * (1.0 - line_values['discount'] / 100.0)
            price_subtotal_after = price_subtotal_before + charge['amount']
            line_values['price_unit'] += charge['amount'] / charge['line_quantity']
            new_price_subtotal_before_discount = line_values['price_unit'] * charge['line_quantity']
            line_values['discount'] = (1 - (price_subtotal_after / new_price_subtotal_before_discount)) * 100.0
