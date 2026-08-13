from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestDebitDocumentTitle(AccountTestInvoicingCommon):

    def test_document_title_for_debit_note(self):
        """Test the document title for Debit note."""

        invoice = self._create_invoice(move_type='out_invoice', post=True)
        debit_note = self._create_debit_note(invoice)

        self._assert_document_titles(debit_note, ['Draft Debit Note'])

        debit_note.action_post()
        self._assert_document_titles(debit_note, ['Debit Note'])

        debit_note.button_cancel()
        self._assert_document_titles(debit_note, ['Cancelled Debit Note'])
