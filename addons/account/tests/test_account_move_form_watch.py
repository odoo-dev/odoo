# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.bus.models.bus import channel_with_db


@tagged('post_install', '-at_install')
class TestAccountMoveFormWatch(AccountTestInvoicingCommon):
    """account.move inherits web.form.record.watch.mixin so that a form view left open
    on an invoice refreshes when something else (typically a cron: OCR, EDI, ...)
    changes the record, instead of requiring the user to reload manually."""

    def _backdate(self, record):
        """Push ``create_date`` into the past so it no longer matches ``cr.now()``,
        simulating a write coming from a transaction that did not create the record
        (e.g. a cron running well after the invoice was created)."""
        self.env.cr.execute(
            "UPDATE account_move SET create_date = create_date - interval '1 day' WHERE id = %s",
            [record.id],
        )
        record.invalidate_recordset(['create_date'])

    def _pop_ephemeral(self):
        return self.env.cr.postcommit.data.pop("bus.bus.ephemeral", [])

    def test_write_on_existing_record_notifies(self):
        move = self._create_invoice()
        self._backdate(move)
        self._pop_ephemeral()  # discard whatever was queued by the setup above

        move.write({'ref': 'updated asynchronously'})

        notifications = self._pop_ephemeral()
        self.assertEqual(len(notifications), 1)
        channel, notification_type, payload = notifications[0]
        self.assertEqual(
            channel,
            channel_with_db(self.env.cr.dbname, f"web.form_watch:account.move:{move.id}"),
        )
        self.assertEqual(notification_type, "web.form_record_updated")
        self.assertEqual(payload, {
            "uid": self.env.uid,
            "resModel": "account.move",
            "resId": move.id,
        })

    def test_write_right_after_create_does_not_notify(self):
        # Nobody can have a form open on a record that doesn't exist yet, so writes
        # happening in the same transaction that created it must stay silent.
        move = self._create_invoice()

        move.write({'ref': 'still in the creating transaction'})

        self.assertFalse(self._pop_ephemeral())

    def test_write_without_values_does_not_notify(self):
        move = self._create_invoice()
        self._backdate(move)
        self._pop_ephemeral()

        move.write({})

        self.assertFalse(self._pop_ephemeral())

    def test_unlink_notifies_deletion(self):
        move = self._create_invoice()
        self._backdate(move)
        self._pop_ephemeral()
        move_id = move.id

        move.unlink()

        notifications = self._pop_ephemeral()
        self.assertEqual(len(notifications), 1)
        channel, notification_type, payload = notifications[0]
        self.assertEqual(
            channel,
            channel_with_db(self.env.cr.dbname, f"web.form_watch:account.move:{move_id}"),
        )
        self.assertEqual(notification_type, "web.form_record_deleted")
        self.assertEqual(payload, {"resModel": "account.move", "resId": move_id})

    def test_unlink_right_after_create_does_not_notify(self):
        move = self._create_invoice()

        move.unlink()

        self.assertFalse(self._pop_ephemeral())
