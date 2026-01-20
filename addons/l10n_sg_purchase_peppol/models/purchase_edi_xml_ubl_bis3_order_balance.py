from lxml import etree

from odoo import models
from odoo.tools import html2plaintext

from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_ubl_cii.models.account_edi_common import FloatFmt
from odoo.addons.l10n_sg_purchase_peppol.tools.peppol_advanced_order import OrderBalance


class PurchaseEdiXmlUbl_Bis3_OrderBalance(models.AbstractModel):
    _name = 'purchase.edi.xml.ubl_bis3_order_balance'
    _inherit = ['purchase.edi.xml.ubl_bis3_order']
    _description = (
        'Export Purchase Order Balance to PEPPOL BIS 3 Order Balance Transaction 1.0'
    )

    # -------------------------------------------------------------------------
    # Configuration
    # -------------------------------------------------------------------------

    def _get_purchase_order_node(self, vals):
        """OVERRIDE: Build an Order Balance node matching the `OrderBalance` template.

        We cannot rely on `purchase.edi.xml.ubl_bis3._get_purchase_order_node()` because it emits
        the full Order structure (Delivery, AllowanceCharges, TaxTotal, ...), and `dict_to_xml`
        will raise when a non-template node is emitted for Order Balance.
        """
        self._add_purchase_order_config_vals(vals)
        self._add_purchase_order_base_lines_vals(vals)
        self._add_purchase_order_currency_vals(vals)
        self._add_purchase_order_tax_grouping_function_vals(vals)
        self._setup_base_lines(vals)
        self._add_purchase_order_monetary_totals_vals(vals)

        document_node = {}
        self._add_purchase_order_header_nodes(document_node, vals)
        self._add_purchase_order_buyer_customer_party_nodes(document_node, vals)
        self._add_purchase_order_seller_supplier_party_nodes(document_node, vals)
        self._add_purchase_order_payment_terms_nodes(document_node, vals)
        self._add_purchase_order_line_nodes(document_node, vals)
        self._add_purchase_order_monetary_total_nodes(document_node, vals)
        return document_node

    def _add_purchase_order_base_lines_vals(self, vals):
        """OVERRIDE: Adjust quantities"""
        purchase_order = vals['purchase_order']

        base_lines = []
        for line in purchase_order.order_line.filtered(
            lambda line: not line.display_type
        ):
            remaining_qty = line.product_qty - line.qty_received
            base_line = line._prepare_base_line_for_taxes_computation()
            base_line['quantity'] = remaining_qty
            base_lines.append(base_line)

        AccountTax = self.env['account.tax']
        AccountTax._add_tax_details_in_base_lines(base_lines, purchase_order.company_id)
        AccountTax._round_base_lines_tax_details(base_lines, purchase_order.company_id)

        vals['base_lines'] = base_lines

    def _add_purchase_order_header_nodes(self, document_node, vals):
        """OVERRIDE: Set Order Balance specific header values"""
        purchase_order = vals['purchase_order']
        document_node.update(
            {
                'cbc:CustomizationID': {
                    '_text': 'urn:fdc:imda.gov.sg:trns:order_balance:1'
                },
                'cbc:ProfileID': {'_text': 'urn:fdc:imda.gov.sg:bis:order_balance:1'},
                'cbc:ID': {'_text': f'{purchase_order.name}-balance'},
                'cbc:IssueDate': {'_text': purchase_order.date_order.date()},
                'cbc:OrderTypeCode': {'_text': '348'},
                'cbc:Note': {'_text': html2plaintext(purchase_order.note)}
                if purchase_order.note
                else None,
                'cbc:DocumentCurrencyCode': {'_text': vals['currency_name']},
                'cbc:CustomerReference': {
                    '_text': purchase_order.origin or purchase_order.company_id.name
                },
                'cac:OrderDocumentReference': {
                    'cbc:ID': {'_text': purchase_order.name},
                    'cbc:IssueDate': {'_text': purchase_order.date_order.date()},
                },
            }
        )

    def _get_party_node(self, vals):
        """
        OVERRIDE: Generate the Party node for Order Balance (buyer / seller).
        """
        partner = vals['partner']
        commercial_partner = partner.commercial_partner_id

        party_node = {
            'cac:PartyIdentification': {
                'cbc:ID': {'_text': commercial_partner.ref},
            },
            'cac:PartyLegalEntity': {
                'cbc:RegistrationName': {'_text': commercial_partner.name},
                'cbc:CompanyID': {'_text': commercial_partner.vat}
                if commercial_partner.vat
                else None,
            },
            'cac:Contact': {
                'cbc:Name': {'_text': partner.name or commercial_partner.name},
                'cbc:Telephone': {'_text': partner.phone} if partner.phone else None,
                'cbc:ElectronicMail': {'_text': partner.email}
                if partner.email
                else None,
            },
        }

        if commercial_partner.peppol_endpoint:
            party_node['cbc:EndpointID'] = {
                '_text': commercial_partner.peppol_endpoint,
                'schemeID': commercial_partner.peppol_eas,
            }

        return party_node

    def _add_purchase_order_line_item_nodes(self, line_node, vals):
        super()._add_purchase_order_line_item_nodes(line_node, vals)
        item_node = line_node['cac:Item']

        item_name = item_node.get('cbc:Name', 'Item')
        line_node['cac:Item'] = {'cbc:Name': item_name}

    def _add_purchase_order_monetary_total_nodes(self, document_node, vals):
        """OVERRIDE: Calculate totals based on remaining quantities only"""
        # Calculate from base_lines which already have the correct remaining quantities
        line_extension_amount = sum(
            base_line['_ubl_values']['line_extension_amount']
            for base_line in vals['base_lines']
        )

        document_node['cac:AnticipatedMonetaryTotal'] = {
            'cbc:LineExtensionAmount': {
                '_text': FloatFmt(line_extension_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
            'cbc:PayableAmount': {
                '_text': FloatFmt(line_extension_amount, min_dp=vals['currency_dp']),
                'currencyID': vals['currency_name'],
            },
        }

    # -------------------------------------------------------------------------
    # Export Method
    # -------------------------------------------------------------------------

    def build_order_balance_xml(self, purchase_order):
        """Build Order Balance XML document"""
        vals = {'purchase_order': purchase_order}
        document_node = self._get_purchase_order_node(vals)
        nsmap = self._get_document_nsmap(vals)
        xml_content = dict_to_xml(document_node, template=OrderBalance, nsmap=nsmap)

        return etree.tostring(
            xml_content, xml_declaration=True, pretty_print=True, encoding='utf-8'
        )

    # -------------------------------------------------------------------------
    # Document NSMap and Tags
    # -------------------------------------------------------------------------

    def _get_document_nsmap(self, vals):
        """OVERRIDE: Return namespace map for Order Balance"""
        return {
            None: 'urn:oasis:names:specification:ubl:schema:xsd:Order-2',
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
        }
