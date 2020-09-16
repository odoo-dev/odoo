/** @odoo-module alias=mail.viewFields.ListActivity.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import ListView from 'web.ListView';
import { createView } from 'web.test_utils';
import { click } from 'web.test_utils_dom';

QUnit.module('mail', {}, function () {
QUnit.module('viewFields', {}, function () {
QUnit.module('ListActivity', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);

        this.data['ir.attachment'].records.push(
            {
                id: 1,
                mimetype: 'image/png',
                name: "filename.jpg",
                res_id: 7,
                res_model: 'res.users',
                type: 'url',
            },
            {
                id: 2,
                mimetype: 'application/x-msdos-program',
                name: "file2.txt",
                res_id: 7,
                res_model: 'res.users',
                type: 'binary',
            },
            {
                id: 3,
                mimetype: 'application/x-msdos-program',
                name: "file3.txt",
                res_id: 5,
                res_model: 'res.users',
                type: 'binary',
            },
        );
        this.data['mail.activity.type'].records.push(
            {
                id: 1,
                name: "Type 1",
            },
            {
                id: 2,
                name: "Type 2",
            },
            {
                category: 'upload_file',
                id: 3,
                name: "Type 3",
            },
            {
                decoration_type: 'warning',
                icon: 'fa-warning',
                id: 4,
                name: "Exception",
            },
        );
        this.data['res.partner'].records.push(
            {
                id: 11,
                im_status: 'online',
            },
        );
        Object.assign(this.data['res.users'].fields, {
            activity_exception_decoration: {
                selection: [['warning', 'Alert'], ['danger', 'Error']],
                string: "Decoration",
                type: 'selection',
            },
            activity_exception_icon: {
                string: "icon",
                type: 'char',
            },
            activity_ids: {
                relation: 'mail.activity',
                relation_field: 'res_id',
                string: "Activities",
                type: 'one2many',
            },
            activity_state: {
                selection: [
                    ['overdue', 'Overdue'],
                    ['today', 'Today'],
                    ['planned', 'Planned'],
                ],
                string: "State",
                type: 'selection',
            },
            activity_summary: {
                string: "Next Activity Summary",
                type: 'char',
            },
            activity_type_icon: {
                string: "Activity Type Icon",
                type: 'char',
            },
            activity_type_id: {
                string: "Activity type",
                type: 'many2one',
                relation: 'mail.activity.type',
            },
            foo: {
                default: "My little Foo Value",
                string: "Foo",
                type: 'char',
            },
            message_attachment_count: {
                string: "Attachment count",
                type: 'integer',
            },
            message_follower_ids: {
                relation: 'mail.followers',
                relation_field: 'res_id',
                string: "Followers",
                type: 'one2many',
            },
            message_ids: {
                relation: 'mail.message',
                relation_field: 'res_id',
                string: "messages",
                type: 'one2many',
            },
        });
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('list activity widget with no activity', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route) {
            assert.step(route);
            return this._super(...arguments);
        },
        session: { uid: 2 },
    });
    const list = await createView({
        arch: `
            <list>
                <field name="activity_ids" widget="list_activity"/>
            </list>
        `,
        env,
        model: 'res.users',
        View: ListView,
    });
    assert.containsOnce(
        list,
        '.o_mail_activity .o_activity_color_default',
    );
    assert.strictEqual(
        list.$('.o_activity_summary').text(),
        '',
    );
    assert.verifySteps([
        '/web/dataset/search_read',
        '/mail/init_messaging',
    ]);

    list.destroy();
});

QUnit.test('list activity widget with activities', async function (assert) {
    assert.expect(7);

    const currentUser = this.data['res.users'].records.find(
        user => user.id === this.data.currentUserId,
    );
    Object.assign(currentUser, {
        activity_ids: [1, 4],
        activity_state: 'today',
        activity_summary: "Call with Al",
        activity_type_icon: 'fa-phone',
        activity_type_id: 3,
    });
    this.data['res.users'].records.push(
        {
            activity_ids: [2],
            activity_state: 'planned',
            activity_summary: false,
            activity_type_id: 2,
            id: 44,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route) {
            assert.step(route);
            return this._super(...arguments);
        },
    });
    const list = await createView({
        arch: `
            <list>
                <field name="activity_ids" widget="list_activity"/>
            </list>
        `,
        env,
        model: 'res.users',
        View: ListView,
    });
    const $firstRow = list.$('.o_data_row:first');
    assert.containsOnce(
        $firstRow,
        '.o_mail_activity .o_activity_color_today.fa-phone',
    );
    assert.strictEqual(
        $firstRow.find('.o_activity_summary').text(),
        "Call with Al",
    );
    const $secondRow = list.$('.o_data_row:nth(1)');
    assert.containsOnce(
        $secondRow,
        '.o_mail_activity .o_activity_color_planned.fa-clock-o',
    );
    assert.strictEqual(
        $secondRow.find('.o_activity_summary').text(),
        "Type 2",
    );
    assert.verifySteps([
        '/web/dataset/search_read',
        '/mail/init_messaging',
    ]);

    list.destroy();
});

QUnit.test('list activity widget with exception', async function (assert) {
    assert.expect(5);

    const currentUser = this.data['res.users'].records.find(
        user => user.id === this.data.currentUserId,
    );
    Object.assign(currentUser, {
        activity_exception_decoration: 'warning',
        activity_exception_icon: 'fa-warning',
        activity_ids: [1],
        activity_state: 'today',
        activity_summary: "Call with Al",
        activity_type_id: 3,
    });
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route) {
            assert.step(route);
            return this._super(...arguments);
        },
    });
    const list = await createView({
        arch: `
            <list>
                <field name="activity_ids" widget="list_activity"/>
            </list>
        `,
        env,
        model: 'res.users',
        View: ListView,
    });
    assert.containsOnce(
        list,
        '.o_activity_color_today.text-warning.fa-warning',
    );
    assert.strictEqual(
        list.$('.o_activity_summary').text(),
        "Warning",
    );
    assert.verifySteps([
        '/web/dataset/search_read',
        '/mail/init_messaging',
    ]);

    list.destroy();
});

QUnit.test('list activity widget: open dropdown', async function (assert) {
    assert.expect(10);

    const currentUser = this.data['res.users'].records.find(
        user => user.id === this.data.currentUserId,
    );
    Object.assign(currentUser, {
        activity_ids: [1, 4],
        activity_state: 'today',
        activity_summary: "Call with Al",
        activity_type_id: 3,
    });
    this.data['mail.activity'].records.push(
        {
            activity_type_id: 3,
            can_write: true,
            create_uid: this.data.currentUserId,
            date_deadline: moment().format("YYYY-MM-DD"), // now
            display_name: "Call with Al",
            id: 1,
            state: 'today',
            user_id: this.data.currentUserId,
        },
        {
            activity_type_id: 1,
            can_write: true,
            create_uid: this.data.currentUserId,
            date_deadline: moment().add(1, 'day').format("YYYY-MM-DD"), // tomorrow
            display_name: "Meet FP",
            id: 4,
            state: 'planned',
            user_id: this.data.currentUserId,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        intercepts: {
            switch_view: () => assert.step('switch_view'),
        },
        async mockRPC(route, args) {
            assert.step(args.method || route);
            if (args.method === 'action_feedback') {
                const currentUser = this.data['res.users'].records.find(
                    user => user.id === env.services.model.messaging.$$$currentUser().$$$id(),
                );
                Object.assign(currentUser, {
                    activity_ids: [4],
                    activity_state: 'planned',
                    activity_summary: "Meet FP",
                    activity_type_id: 1,
                });
                return;
            }
            return this._super(route, args);
        },
    });
    const list = await createView({
        arch: `
            <list>
                <field name="foo"/>
                <field name="activity_ids" widget="list_activity"/>
            </list>`,
        model: 'res.users',
        View: ListView,
    });
    assert.strictEqual(
        list.$('.o_activity_summary').text(),
        "Call with Al",
    );

    // click on the first record to open it, to ensure that the 'switch_view'
    // assertion is relevant (it won't be opened as there is no action manager,
    // but we'll log the 'switch_view' event)
    await click(list.$('.o_data_cell:first'));
    // from this point, no 'switch_view' event should be triggered, as we
    // interact with the activity widget
    assert.step('open dropdown');

    await click(list.$('.o_activity_btn span')); // open the popover
    await click(list.$('.o_mark_as_done:first')); // mark the first activity as done
    await click(list.$('.o_activity_popover_done')); // confirm
    assert.strictEqual(
        list.$('.o_activity_summary').text(),
        "Meet FP",
    );
    assert.verifySteps([
        '/web/dataset/search_read',
        '/mail/init_messaging',
        'switch_view',
        'open dropdown',
        'activity_format',
        'action_feedback',
        'read',
    ]);

    list.destroy();
});

QUnit.test('list activity exception widget with activity', async function (assert) {
    assert.expect(3);

    const currentUser = this.data['res.users'].records.find(
        user => user.id === this.data.currentUserId,
    );
    currentUser.activity_ids = [1];
    this.data['mail.activity'].records.push(
        {
            activity_type_id: 1,
            can_write: true,
            create_uid: 2,
            date_deadline: moment().format("YYYY-MM-DD"), // now
            display_name: "An activity",
            id: 1,
            state: 'today',
            user_id: 2,
        },
        {
            activity_type_id: 4,
            can_write: true,
            create_uid: 2,
            date_deadline: moment().format("YYYY-MM-DD"), // now
            display_name: "An exception activity",
            id: 2,
            state: 'today',
            user_id: 2,
        },
    );
    this.data['res.users'].records.push(
        {
            activity_ids: [2],
            activity_exception_decoration: 'warning',
            activity_exception_icon: 'fa-warning',
            display_name: "second partner",
            foo: "Tommy",
            id: 13,
            message_attachment_count: 3,
            message_follower_ids: [],
            message_ids: [],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const list = await createView({
        arch: `
            <tree>
                <field name="foo"/>
                <field name="activity_exception_decoration" widget="activity_exception"/>
            </tree>
        `,
        env,
        model: 'res.users',
        View: ListView,
    });
    assert.containsN(
        list,
        '.o_data_row',
        2,
        "should have two records",
    );
    assert.doesNotHaveClass(
        list.$('.o_data_row:eq(0) .o_activity_exception_cell div'),
        'fa-warning',
        "there is no any exception activity on record",
    );
    assert.hasClass(
        list.$('.o_data_row:eq(1) .o_activity_exception_cell div'),
        'fa-warning',
        "there is an exception on a record",
    );

    list.destroy();
});

});
});
});
