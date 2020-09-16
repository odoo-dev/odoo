/** @odoo-module alias=note.legacy.ActivityMenu.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import { click } from 'web.test_utils_dom';
import { editInput } from 'web.test_utils_fields';

QUnit.module('note', {}, function () {
QUnit.module('legacy', {}, function () {
QUnit.module('ActivityMenu', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);

        Object.assign(this.data, {
            'mail.activity.menu': {
                fields: {
                    name: { type: 'char' },
                    model: { type: 'char' },
                    type: { type: 'char' },
                    planned_count: { type: 'integer' },
                    today_count: { type: 'integer' },
                    overdue_count: { type: 'integer' },
                    total_count: { type: 'integer' }
                },
                records: [],
            },
            'note.note': {
                fields: {
                    memo: { type: 'char' },
                },
                records: [],
            }
        });
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('note activity menu widget: create note from activity menu', async function (assert) {
    assert.expect(15);

    const self = this;
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'systray_get_activities') {
                return self.data['mail.activity.menu'].records;
            }
            if (route === '/note/new') {
                if (args.date_deadline) {
                    const note = {
                        date_deadline: args.date_deadline,
                        id: 1,
                        memo: args.note,
                    };
                    self.data['note.note'].records.push(note);
                    if (_.isEmpty(self.data['mail.activity.menu'].records)) {
                        self.data['mail.activity.menu'].records.push(
                            {
                                model: 'note.note',
                                name: "Note",
                                overdue_count: 0,
                                planned_count: 0,
                                today_count: 0,
                                total_count: 0,
                                type: 'activity',
                            },
                        );
                    }
                    self.data['mail.activity.menu'].records[0].today_count++;
                    self.data['mail.activity.menu'].records[0].total_count++;
                }
                return;
            }
            return this._super(route, args);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMenu',
    );
    assert.hasClass(
        document.querySelector,
        'o_mail_systray_item',
        "should be the instance of widget",
    );
    assert.strictEqual(
        $('.o_notification_counter').text(),
        '0',
        "should not have any activity notification initially",
    );

    // toggle quick create for note
    await click($('.dropdown-toggle'));
    assert.containsOnce(
        document.body,
        '.o_no_activity',
        "should not have any activity preview",
    );
    assert.doesNotHaveClass(
        $('.o_note_show'),
        'd-none',
        "ActivityMenu should have Add new note CTA",
    );

    await click($('.o_note_show'));
    assert.hasClass(
        $('.o_note_show'),
        'd-none',
        "ActivityMenu should hide CTA when entering a new note",
    );
    assert.doesNotHaveClass(
        $('.o_note'),
        'd-none',
        "ActivityMenu should display input for new note",
    );

    // creating quick note without date
    await editInput(
        $("input.o_note_input"),
        "New Note",
    );
    await click($(".o_note_save"));
    assert.strictEqual(
        $('.o_notification_counter').text(),
        '1',
        "should increment activity notification counter after creating a note",
    );
    assert.containsOnce(
        document.body,
        '.o_mail_preview[data-res_model="note.note"]',
        "should have an activity preview that is a note",
    );
    assert.strictEqual(
        $('.o_activity_filter_button[data-filter="today"]').text().trim(),
        "1 Today",
        "should display one note for today",
    );
    assert.doesNotHaveClass(
        $('.o_note_show'),
        'd-none',
        "ActivityMenu add note button should be displayed",
    );
    assert.hasClass(
        $('.o_note'),
        'd-none',
        "ActivityMenu add note input should be hidden",
    );

    // creating quick note with date
    await click($('.o_note_show'));
    $('input.o_note_input').val("New Note");
    await click($(".o_note_save"));
    assert.strictEqual(
        $('.o_notification_counter').text(),
        '2',
        "should increment activity notification counter after creating a second note",
    );
    assert.strictEqual(
        $('.o_activity_filter_button[data-filter="today"]').text().trim(),
        "2 Today",
        "should display 2 notes for today",
    );
    assert.doesNotHaveClass(
        $('.o_note_show'),
        'd-none',
        "ActivityMenu add note button should be displayed",
    );
    assert.hasClass(
        $('.o_note'),
        'd-none',
        "ActivityMenu add note input should be hidden",
    );
});

});
});
});
