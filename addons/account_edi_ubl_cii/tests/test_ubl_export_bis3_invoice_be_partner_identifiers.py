from odoo.addons.account_edi_ubl_cii.tests.test_ubl_export_bis3_be import TestUblExportBis3BE
from odoo.tests import tagged

from freezegun import freeze_time

@tagged('post_install_l10n', 'post_install', '-at_install')
class TestUblExportBis3InvoiceBEPartnerIdentifiers(TestUblExportBis3BE):

    @classmethod
    def subfolders(cls):
        subfolder_format, _subfolder_document, subfolder_country = super().subfolders()
        return subfolder_format, 'invoice', subfolder_country
