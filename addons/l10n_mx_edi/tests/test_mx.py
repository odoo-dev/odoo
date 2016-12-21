# -*- coding: utf-8 -*-
import base64
import logging

from lxml import etree

from odoo import _, tools
from odoo.exceptions import ValidationError
from odoo.tests import common

_logger = logging.getLogger(__name__)


class TestMX(common.TransactionCase):

    def test_mx_invoice(self):
        Invoice = self.env['account.invoice']
        invoices_ids = Invoice.search([('state', 'in', ['open', 'paid'])])
        for invoice in invoices_ids:
            if invoice.sent:
                country_code = invoice.company_id.country_id.code
                if country_code == 'MX':
                    attachment_ids = invoice.generate_edi_MX()
                    filenames = invoice.get_edi_filenames_MX()
                    for attachment_id in attachment_ids:
                        if attachment_id.name in filenames:
                            xml_schema_doc = etree.parse(tools.file_open(
                                'account_mx/data/xsd/mx_invoice.xsd'))
                            xsd_schema = etree.XMLSchema(xml_schema_doc)
                            tree = tools.str_as_tree(base64.decodestring(attachment_id.datas))
                            try:
                                xsd_schema.assertValid(tree)
                            except etree.DocumentInvalid, xml_errors:
                                error_pattern = 'The generate file %s is unvalid:\n%s'
                                error = reduce(lambda x, y: x + y, map(lambda z: z.message + '\n', xml_errors.error_log))
                                raise ValidationError(_(error_pattern % (attachment_id.name, error)))
                            _logger.info('File %s for invoice %s is valid', attachment_id.name, invoice.number)
