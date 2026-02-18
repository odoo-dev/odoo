# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import etree

from odoo.tools import cleanup_xml_node
from odoo.addons.l10n_hu_edi.models.l10n_hu_edi_connection import L10nHuEdiConnection as BaseL10nHuEdiConnection, XML_NAMESPACES


class L10nHuEdiConnection(BaseL10nHuEdiConnection):

    def query_invoice_digest(self, credentials, datetime_from, datetime_to, page=1, digests=[]):
        template_values = {
            **self._get_header_values(credentials),
            'page': page,
            'invoiceDirection': 'INBOUND',
            'dateTimeFrom': datetime_from,
            'dateTimeTo': datetime_to,
        }
        request_data = self.env['ir.qweb']._render('l10n_hu_edi_receive.query_invoice_digest_request', template_values)
        request_data = etree.tostring(cleanup_xml_node(request_data, remove_blank_nodes=False), xml_declaration=True, encoding='UTF-8')

        response_xml = self._call_nav_endpoint(credentials['mode'], 'queryInvoiceDigest', request_data, timeout=60)
        self._parse_error_response(response_xml)

        current_page = int(response_xml.findtext('api:invoiceDigestResult/api:currentPage', namespaces=XML_NAMESPACES))
        available_page = int(response_xml.findtext('api:invoiceDigestResult/api:availablePage', namespaces=XML_NAMESPACES))

        if available_page == 0:
            return digests

        digests += self.env['account.move']._l10n_hu_edi_parse_digest_response(response_xml)

        if current_page == available_page:
            return digests

        return self.query_invoice_digest(credentials, datetime_from, datetime_to, page=current_page + 1, digests=digests)

    def query_invoice_data(self, credentials, digests):
        moves_vals = []
        for query_invoice_data_params in digests:
            template_values = {
                **self._get_header_values(credentials),
                **query_invoice_data_params,
            }

            request_data = self.env['ir.qweb']._render('l10n_hu_edi_receive.query_invoice_data_request', template_values)
            request_data = etree.tostring(cleanup_xml_node(request_data, remove_blank_nodes=False), xml_declaration=True, encoding='UTF-8')

            response_xml = self._call_nav_endpoint(credentials['mode'], 'queryInvoiceData', request_data, timeout=60)
            self._parse_error_response(response_xml)

            moves_vals += self.env['account.move']._l10n_hu_edi_parse_query_invoice_data_response(response_xml)

        return moves_vals
