from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.models import Model
from odoo.tests import tagged
from odoo.tests.common import Form
from odoo import fields
from odoo.exceptions import UserError
from odoo.tools import format_date


@tagged('post_install', '-at_install')
class TestAccountMoveInalterableHash(AccountTestInvoicingCommon):
    @classmethod
    def setUpClass(cls, chart_template_ref=None):
        super().setUpClass(chart_template_ref=chart_template_ref)

    def test_account_move_inalterable_hash(self):
        """Test that we cannot alter a field used for the computation of the inalterable hash"""
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        move = self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000], post=True)

        with self.assertRaisesRegex(UserError, "You cannot overwrite the values ensuring the inalterability of the accounting."):
            move.inalterable_hash = 'fake_hash'
        with self.assertRaisesRegex(UserError, "You cannot edit the following fields due to restrict mode being activated.*"):
            move.name = "fake name"
        with self.assertRaisesRegex(UserError, "You cannot edit the following fields due to restrict mode being activated.*"):
            move.date = fields.Date.from_string('2023-01-02')

        with self.assertRaisesRegex(UserError, "You cannot edit the following fields.*Label.*"):
            move.line_ids[0].name = "coucou"

        with self.assertRaisesRegex(UserError, "You cannot edit the following fields due to restrict mode being activated on the journal.*"):
            self.env['account.resequence.wizard'].create({
                'move_ids': move.ids,
                'first_name': 'NEW_INV',
            }).resequence()

        # The following fields are not part of the hash so they can be modified
        move.ref = "bla"
        move.line_ids[0].date_maturity = fields.Date.from_string('2023-01-02')

    def test_account_move_hash_integrity_report(self):
        """Test the hash integrity report"""
        moves = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
        )
        moves.action_post()

        # No records to be hashed because the restrict mode is not activated yet
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]  # First journal
        self.assertEqual(integrity_check['msg'], 'This journal is not in strict mode.')

        # No records to be hashed even if the restrict mode is activated because the hashing is not retroactive
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], "There is no journal entry flagged for data inalterability yet.")

        # Everything should be correctly hashed and verified
        # First sequence
        first_chain_moves = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-03", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-04", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_a, "2023-01-05", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-06", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_a, "2023-01-07", amounts=[1000, 2000])
        )
        first_chain_moves.action_post()
        moves |= first_chain_moves

        # Second sequence
        second_chain_moves_first_move = self.init_invoice("out_invoice", self.partner_a, "2023-01-08", amounts=[1000, 2000])
        second_chain_moves_first_move.name = "A_NEW_INV/1"
        second_chain_moves_first_move.action_post()
        second_chain_moves = (
            second_chain_moves_first_move
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-09", amounts=[1000, 2000], post=True)
            | self.init_invoice("out_invoice", self.partner_a, "2023-01-09", amounts=[1000, 2000], post=True)
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-08", amounts=[1000, 2000], post=True)
            | self.init_invoice("out_invoice", self.partner_a, "2023-01-07", amounts=[1000, 2000], post=True)
        )
        moves |= second_chain_moves

        # First sequence again
        first_chain_moves_new_move = self.init_invoice("out_invoice", self.partner_a, "2023-01-08", amounts=[1000, 2000])
        first_chain_moves_new_move.name = first_chain_moves[-1].name[:-1] + str(int(first_chain_moves[-1].name[-1]) + 1)
        first_chain_moves_new_move.action_post()
        first_chain_moves |= first_chain_moves_new_move

        # Verification of the two chains. After grouping, the chains are ordered by sequence_prefix,
        # so, the first chain is the second one in the list.
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results']
        self.assertEqual(integrity_check[1]['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check[1]['from_name'], first_chain_moves[0].name)
        self.assertEqual(integrity_check[1]['to_name'], first_chain_moves[-1].name)
        self.assertEqual(integrity_check[0]['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check[0]['from_name'], second_chain_moves[0].name)
        self.assertEqual(integrity_check[0]['to_name'], second_chain_moves[-1].name)

        # Let's change one of the fields used by the hash. It should be detected by the integrity report.
        # We need to bypass the write method of account.move to do so.
        Model.write(first_chain_moves[3], {'date': fields.Date.from_string('2023-01-07')})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][1]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {first_chain_moves[3].id}.')

        # Revert the previous change
        Model.write(first_chain_moves[3], {'date': fields.Date.from_string("2023-01-06")})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][1]
        self.assertEqual(integrity_check['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check['from_name'], first_chain_moves[0].name)
        self.assertEqual(integrity_check['to_name'], first_chain_moves[-1].name)

        # Let's try with one of the subfields
        Model.write(second_chain_moves[-1].line_ids[0], {'name': 'coucou'})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {second_chain_moves[-1].id}.')

        # Let's try with the inalterable_hash field itself
        Model.write(first_chain_moves[-1].line_ids[0], {'name': 'coucou'})  # Revert the previous change
        Model.write(second_chain_moves[-1], {'inalterable_hash': 'fake_hash'})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {second_chain_moves[-1].id}.')

    def test_account_move_hash_versioning_1(self):
        """We are updating the hash algorithm. We want to make sure that we do not break the integrity report.
        This test focuses on the case where the user has only moves with the old hash algorithm."""
        self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000], post=True)  # Not hashed
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        moves = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-04", amounts=[1000, 2000])
        )
        moves.with_context(hash_version=1).action_post()
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check['from_name'], moves[0].name)
        self.assertEqual(integrity_check['to_name'], moves[-1].name)

        # Let's change one of the fields used by the hash. It should be detected by the integrity report
        # independently of the hash version used. I.e. we first try the v1 hash, then the v2 hash and neither should work.
        # We need to bypass the write method of account.move to do so.
        Model.write(moves[1], {'date': fields.Date.from_string('2023-01-07')})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {moves[1].id}.')

    def test_account_move_hash_versioning_2(self):
        """We are updating the hash algorithm. We want to make sure that we do not break the integrity report.
        This test focuses on the case where the user has only moves with the new hash algorithm."""
        self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000], post=True)  # Not hashed
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        moves = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves.action_post()
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check['from_name'], moves[0].name)
        self.assertEqual(integrity_check['to_name'], moves[-1].name)

        # Let's change one of the fields used by the hash. It should be detected by the integrity report
        # independently of the hash version used. I.e. we first try the v1 hash, then the v2 hash and neither should work.
        # We need to bypass the write method of account.move to do so.
        Model.write(moves[1], {'date': fields.Date.from_string('2023-01-07')})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {moves[1].id}.')

    def test_account_move_hash_versioning_v1_to_v2(self):
        """We are updating the hash algorithm. We want to make sure that we do not break the integrity report.
        This test focuses on the case where the user has moves with both hash algorithms."""
        self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000], post=True)  # Not hashed
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        moves_v1 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v1.with_context(hash_version=1).action_post()
        fields_v1 = moves_v1.with_context(hash_version=1)._get_integrity_hash_fields()
        moves_v2 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v2.with_context(hash_version=2).action_post()
        fields_v2 = moves_v2._get_integrity_hash_fields()
        self.assertNotEqual(fields_v1, fields_v2)  # Make sure two different hash algorithms were used

        moves = moves_v1 | moves_v2
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check['from_name'], moves[0].name)
        self.assertEqual(integrity_check['to_name'], moves[-1].name)

        # Let's change one of the fields used by the hash. It should be detected by the integrity report
        # independently of the hash version used. I.e. we first try the v1 hash, then the v2 hash and neither should work.
        # We need to bypass the write method of account.move to do so.
        Model.write(moves[4], {'date': fields.Date.from_string('2023-01-07')})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {moves[4].id}.')

        # Let's revert the change and make sure that we cannot use the v1 after the v2.
        # This means we don't simply check whether the move is correctly hashed with either algorithms,
        # but that we can only use v2 after v1 and not go back to v1 afterwards.
        Model.write(moves[4], {'date': fields.Date.from_string("2023-01-02")})  # Revert the previous change
        moves_v1_bis = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-10", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-11", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-12", amounts=[1000, 2000])
        )
        moves_v1_bis.with_context(hash_version=1).action_post()
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {moves_v1_bis[0].id}.')

    def test_account_move_hash_versioning_3(self):
        """
        Version 2 does not take into account floating point representation issues.
        Test that version 3 covers correctly this case
        """
        self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000], post=True)  # Not hashed
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        moves_v3 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[30*0.17, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v3.action_post()

        # invalidate cache
        moves_v3[0].line_ids[0].invalidate_recordset()

        integrity_check_v3 = moves_v3.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check_v3['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check_v3['from_name'], moves_v3[0].name)

    def test_account_move_hash_versioning_v2_to_v3(self):
        """
        We are updating the hash algorithm. We want to make sure that we do not break the integrity report.
        This test focuses on the case with version 2 and version 3.
        """
        self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000], post=True)  # Not hashed
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        moves_v2 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v2.with_context(hash_version=2).action_post()

        moves_v3 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v3.with_context(hash_version=3).action_post()

        moves = moves_v2 | moves_v3
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check['from_name'], moves[0].name)
        self.assertEqual(integrity_check['to_name'], moves[-1].name)

        Model.write(moves[1], {'date': fields.Date.from_string('2023-01-07')})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {moves[1].id}.')

    def test_account_move_hash_versioning_v3_to_v4(self):
        """
        We are updating the hash algorithm. We want to make sure that we do not break the integrity report.
        This test focuses on the case with version 3 and version 4.
        """
        self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000], post=True)  # Not hashed
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        moves_v3 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v3.with_context(hash_version=3).action_post()

        moves_v4 = (
            self.init_invoice("out_invoice", self.partner_a, "2023-01-01", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-02", amounts=[1000, 2000])
            | self.init_invoice("out_invoice", self.partner_b, "2023-01-03", amounts=[1000, 2000])
        )
        moves_v4.with_context(hash_version=4).action_post()

        moves = moves_v3 | moves_v4
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], "Entries are correctly hashed")
        self.assertEqual(integrity_check['from_name'], moves[0].name)
        self.assertEqual(integrity_check['to_name'], moves[-1].name)

        Model.write(moves[1], {'date': fields.Date.from_string('2023-01-07')})
        integrity_check = moves.company_id._check_accounting_hash_integrity()['results'][0]
        self.assertEqual(integrity_check['msg'], f'Corrupted data on journal entry with id {moves[1].id}.')

    def test_account_move_hash_with_cash_rounding(self):
        # Enable inalterable hash
        self.company_data['default_journal_sale'].restrict_mode_hash_table = True
        # Required for `invoice_cash_rounding_id` to be visible in the view
        self.env.user.groups_id += self.env.ref('account.group_cash_rounding')
        # Test 'add_invoice_line' rounding
        invoice = self.init_invoice('out_invoice', products=self.product_a+self.product_b)
        move_form = Form(invoice)
        # Add a cash rounding having 'add_invoice_line'.
        move_form.invoice_cash_rounding_id = self.cash_rounding_a
        with move_form.invoice_line_ids.edit(0) as line_form:
            line_form.price_unit = 999.99
        move_form.save()

        # Should not raise
        invoice.action_post()

        self.assertEqual(invoice.amount_total, 1410.0)
        self.assertEqual(invoice.amount_untaxed, 1200.0)
        self.assertEqual(invoice.amount_tax, 210)
        self.assertEqual(len(invoice.invoice_line_ids), 2)
        self.assertEqual(len(invoice.line_ids), 6)
