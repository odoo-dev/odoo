from odoo import models
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_cii.tools import CrossIndustryInvoice
from lxml import etree

import logging

_logger = logging.getLogger(__name__)

DEFAULT_FACTURX_DATE_FORMAT = '%Y%m%d'
CII_NAMESPACES = {
    'ram': "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    'rsm': "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    'udt': "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}

# Imcomplete, full list on https://service.unece.org/trade/untdid/d16b/tred/tred4461.htm
PAYMENT_MEAN_CODES = {
    'Payment to bank account': 42,
    'SEPA direct debit': 59
}


class AccountEdiXmlCii(models.AbstractModel):
    """ Factur-X / ZUGFeRD: a UN/CEFACT CII D16B XML following the EN 16931 business rules, embedded in a PDF/A-3.

    * Specification: https://fnfe-mpe.org/factur-x/ (Factur-X 1.0 = ZUGFeRD 2.x)
    """
    _name = 'account.edi.xml.cii'
    _inherit = ['account.edi.cen_en16931', 'account.edi.cii']
    _description = "Factur-x/ZUGFeRD CII 2.2.0"

    def _find_value(self, xpath, tree, nsmap=False):
        # EXTENDS account.edi.common
        return super()._find_value(xpath, tree, CII_NAMESPACES)

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    def _export_invoice_filename(self, invoice):
        if invoice.commercial_partner_id.country_code == 'DE':
            return f"{invoice.name.replace('/', '_')}_zugferd.xml"
        return f"{invoice.name.replace('/', '_')}_factur_x.xml"

    def _export_document_constraints(self, vals):
        # EXTENDS account.edi.cen_en16931
        constraints = super()._export_document_constraints(vals)
        constraints.update(self._cii_constraints(vals['invoice'], vals))
        return constraints

    def _get_document_nsmap(self):
        return {
            'ram': "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
            'rsm': "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
            'udt': "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
            'qdt': "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
            'xsi': "http://www.w3.org/2001/XMLSchema-instance",
        }

    def _export_document(self, vals):
        """ Build the document node (vals['document_node']) and collect the errors (vals['errors']). """
        self._cii_add_invoice_config_vals(vals)
        vals['document_node'] = {}
        self._cii_add_exchanged_document_context_node(vals)
        self._cii_add_exchanged_document_node(vals)
        self._cii_add_supply_chain_trade_transaction_node(vals)
        vals['errors'] = self._get_export_errors(vals)
        return vals

    def _export_invoice(self, invoice):
        # EXTENDS account.edi.common
        self._validate_taxes(invoice.invoice_line_ids.tax_ids)
        vals = self._init_invoice_export_values(invoice)
        self._export_document(vals)
        xml_content = dict_to_xml(vals['document_node'], nsmap=self._get_document_nsmap(), template=CrossIndustryInvoice)
        return etree.tostring(xml_content, xml_declaration=True, encoding='UTF-8'), vals['errors']

    # -------------------------------------------------------------------------
    # IMPORT
    # -------------------------------------------------------------------------

    def _get_import_document_amount_sign(self, tree):
        """
        In factur-x, an invoice has code 380 and a credit note has code 381. However, a credit note can be expressed
        as an invoice with negative amounts. For this case, we need a factor to take the opposite of each quantity
        in the invoice.
        """
        move_type_code = tree.find('.//{*}ExchangedDocument/{*}TypeCode')
        if move_type_code is None:
            return None, None
        if move_type_code.text in ['381', '261', '503']:
            return 'refund', 1
        if move_type_code.text in ['380', '386', '389', '527']:
            amount_node = tree.find('.//{*}SpecifiedTradeSettlementHeaderMonetarySummation/{*}GrandTotalAmount')
            if amount_node is not None and float(amount_node.text) < 0:
                return 'refund', -1
            return 'invoice', 1
        return None, None

    def _import_invoice_ubl_cii(self, invoice, file_data, new=False):
        """
        :param account.move invoice:
        """
        if invoice.invoice_line_ids:
            return invoice._reason_cannot_decode_has_invoice_lines()
        return self._cii_import_invoice(invoice, file_data, new=new)

