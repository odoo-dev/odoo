from contextlib import contextmanager

from odoo.addons.account.tests.common import AccountTestInvoicingCommon

# Fields tracked on every line for change detection.
TRACKED_LINE_FIELDS = ('display_type', 'debit', 'credit', 'amount_currency', 'balance', 'currency_id', 'name')

# Display types in the order the sync engine actually resyncs them.
LINE_TYPE_ORDER = ('product', 'epd', 'tax', 'discount', 'rounding', 'payment_term')


class SyncLinesCase(AccountTestInvoicingCommon):
    """ Shared tooling for exploring account.move's line-sync mechanisms. """

    @staticmethod
    def _get_invoice_lines_per_display_types(lines):
        """ Tuple of one element per LINE_TYPE_ORDER position: None, the line, or a
        list of lines sorted by id. """
        result = []
        for display_type in LINE_TYPE_ORDER:
            matching = lines.filtered(lambda l, dt=display_type: l.display_type == dt)
            if not matching:
                result.append(None)
            elif len(matching) == 1:
                result.append(matching)
            else:
                result.append(list(matching.sorted('id')))
        return tuple(result)

    @contextmanager
    def _assert_invoice_lines_changes(self, invoice, expected_events, extra_fields=()):
        """ Asserts that exactly `expected_events` occurred to invoice.line_ids in the
        block: ('deleted', id) / ('created', vals) / ('updated', id, changed_vals). """
        tracked_fields = (*TRACKED_LINE_FIELDS, *extra_fields)

        def snapshot():
            return {line.id: {f: line[f] for f in tracked_fields} for line in invoice.line_ids}

        before = snapshot()
        yield
        after = snapshot()

        deleted_ids = sorted(set(before) - set(after))
        created_ids = sorted(set(after) - set(before))
        updated_ids = sorted(i for i in (set(before) & set(after)) if before[i] != after[i])

        seen_types = (
            {before[i]['display_type'] for i in deleted_ids}
            | {after[i]['display_type'] for i in created_ids}
            | {after[i]['display_type'] for i in updated_ids}
        )
        ordered_types = list(LINE_TYPE_ORDER) + sorted(seen_types - set(LINE_TYPE_ORDER))

        events = []
        for display_type in ordered_types:
            for i in deleted_ids:
                if before[i]['display_type'] == display_type:
                    events.append(('deleted', i))
            for i in created_ids:
                if after[i]['display_type'] == display_type:
                    events.append(('created', after[i]))
            for i in updated_ids:
                if after[i]['display_type'] == display_type:
                    changed = {f: after[i][f] for f in tracked_fields if before[i][f] != after[i][f]}
                    events.append(('updated', i, changed))

        self.assertEqual(events, expected_events)
