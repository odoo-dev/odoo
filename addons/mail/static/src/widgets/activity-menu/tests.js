/** @odoo-module alias=mail.widgets.ActivityMenu.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import { click } from 'web.test_utils_dom';
import { intercept } from 'web.test_utils_mock';

QUnit.module('mail', {}, function () {
QUnit.module('wigets', {}, function () {
QUnit.module('ActivityMenu', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);

        Object.assign(this.data, {
            'mail.activity.menu': {
                fields: {
                    actions: [
                        {
                            action_xmlid: { type: 'char' },
                            icon: { type: 'char' },
                            name: { type: 'char' },
                        },
                    ],
                    model: { type: 'char' },
                    name: { type: 'char' },
                    overdue_count: { type: 'integer' },
                    planned_count: { type: 'integer' },
                    today_count: { type: 'integer' },
                    total_count: { type: 'integer' },
                    type: { type: 'char' },
                },
                records: [
                    {
                        model: 'res.partner',
                        name: "Contact",
                        overdue_count: 0,
                        planned_count: 0,
                        today_count: 1,
                        total_count: 1,
                        type: 'activity',
                    },
                    {
                        model: 'project.task',
                        name: "Task",
                        overdue_count: 0,
                        planned_count: 1,
                        today_count: 0,
                        total_count: 1,
                        type: "activity",
                    },
                    {
                        actions: [
                            {
                                icon: 'fa-clock-o',
                                name: "summary",
                            },
                        ],
                        model: 'project.issue',
                        name: "Issue",
                        overdue_count: 1,
                        planned_count: 1,
                        today_count: 1,
                        total_count: 3,
                        type: 'activity',
                    },
                    {
                        actions: [
                            {
                                action_xmlid: 'mail.mail_activity_type_view_tree',
                                icon: 'fa-clock-o',
                                name: "summary",
                            },
                        ],
                        model: 'partner',
                        name: "Note",
                        overdue_count: 1,
                        planned_count: 1,
                        today_count: 1,
                        total_count: 3,
                        type: 'activity',
                    },
                ],
            },
        });
        this.session = {
            uid: 10,
        };
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('activity menu widget: menu with no records', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'systray_get_activities') {
                return [];
            }
            return this._super(route, args);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMenu',
    );
    assert.containsOnce(
        document.body,
        '.o_no_activity',
    );
});

QUnit.test('activity menu widget: activity menu with 3 records', async function (assert) {
    assert.expect(10);

    const self = this;
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'systray_get_activities') {
                return self.data['mail.activity.menu']['records'];
            }
            return this._super(route, args);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMenu',
    );
    assert.hasClass(
        document.body,
        'o_mail_systray_item',
        "should be the instance of widget",
    );
    // the assertion below has not been replace because there are includes of ActivityMenu that modify the length.
    assert.containsOnce(
        document.body,
        '.o_mail_preview',
    );
    assert.containsOnce(
        document.body,
        '.o_notification_counter',
        "widget should have notification counter",
    );
    assert.strictEqual(
        parseInt(activityMenu.el.innerText),
        8,
        "widget should have 8 notification counter",
    );

    let context = {};
    intercept(
        activityMenu,
        'do_action',
        function (event) {
            assert.deepEqual(
                event.data.action.context,
                context,
                "wrong context value",
            );
        },
        true,
    );

    // case 1: click on "late"
    context = {
        force_search_count: 1,
        search_default_activities_overdue: 1,
    };
    await click($('.dropdown-toggle'));
    assert.hasClass(
        document.querySelector('o-ActivityMenu'),
        'show',
        "ActivityMenu should be open",
    );

    await click($(".o_activity_filter_button[data-model_name='Issue'][data-filter='overdue']"));
    assert.doesNotHaveClass(
        document.querySelector('o-ActivityMenu'),
        'show',
        "ActivityMenu should be closed",
    );

    // case 2: click on "today"
    context = {
        force_search_count: 1,
        search_default_activities_today: 1,
    };
    await click($('.dropdown-toggle'));
    await click($(".o_activity_filter_button[data-model_name='Issue'][data-filter='today']"));
    // case 3: click on "future"
    context = {
        force_search_count: 1,
        search_default_activities_upcoming_all: 1,
    };
    await click($('.dropdown-toggle'));
    await click($(".o_activity_filter_button[data-model_name='Issue'][data-filter='upcoming_all']"));
    // case 4: click anywere else
    context = {
        force_search_count: 1,
        search_default_activities_overdue: 1,
        search_default_activities_today: 1,
    };
    await click($('.dropdown-toggle'));
    await click($(".o_mail_systray_dropdown_items > div[data-model_name='Issue']"));
});

QUnit.test('activity menu widget: activity view icon', async function (assert) {
    assert.expect(12);

    const self = this;
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'systray_get_activities') {
                return self.data['mail.activity.menu'].records;
            }
            return this._super(route, args);
        },
        session: this.session,
    });
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMenu',
    );
    assert.containsN(
        document.body,
        '.o_mail_activity_action',
        2,
        "widget should have 2 activity view icons",
    );
    const $first = $('.o_mail_activity_action').eq(0);
    const $second = $('.o_mail_activity_action').eq(1);
    assert.strictEqual(
        $first.data('model_name'),
        "Issue",
        "first activity action should link to 'Issue'",
    );
    assert.hasClass(
        $first,
        'fa-clock-o',
        "should display the activity action icon",
    );
    assert.strictEqual(
        $second.data('model_name'),
        "Note",
        "Second activity action should link to 'Note'",
    );
    assert.hasClass(
        $second,
        'fa-clock-o',
        "should display the activity action icon",
    );
    intercept(
        activityMenu,
        'do_action',
        function (ev) {
            if (ev.data.action.name) {
                assert.ok(
                    ev.data.action.domain,
                    "should define a domain on the action",
                );
                assert.deepEqual(
                    ev.data.action.domain,
                    [["activity_ids.user_id", "=", 10]],
                    "should set domain to user's activity only",
                );
                assert.step(
                    'do_action:' + ev.data.action.name,
                );
            } else {
                assert.step(
                    'do_action:' + ev.data.action,
                );
            }
        },
        true,
    );

    // click on the "Issue" activity icon
    await click($('.dropdown-toggle'));
    assert.hasClass(
        document.querySelector('.o-ActivityMenu'),
        'show',
        "dropdown should be expanded",
    );

    await click($(".o_mail_activity_action[data-model_name='Issue']"));
    assert.doesNotHaveClass(
        document.querySelector('.o-ActivityMenu'),
        'show',
        "dropdown should be collapsed",
    );

    // click on the "Note" activity icon
    await click($('.dropdown-toggle'));
    await click($(".o_mail_activity_action[data-model_name='Note']"));
    assert.verifySteps([
        'do_action:Issue',
        'do_action:mail.mail_activity_type_view_tree',
    ]);
});

QUnit.test('activity menu widget: close on messaging menu click', async function (assert) {
    assert.expect(2);

    createEnv(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'message_fetch') {
                return [];
            }
            if (args.method === 'systray_get_activities') {
                return [];
            }
            return this._super(route, args);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'MessagingMenu',
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMenu',
    );
    await click($('.o-ActivityMenu .dropdown-toggle'));
    assert.hasClass(
        document.querySelector('.o_mail_systray_dropdown'),
        'show',
        "activity menu should be shown after click on itself",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o_mail_systray_dropdown'),
        'show',
        "activity menu should be hidden after click on messaging menu",
    );
});

});
});
});
