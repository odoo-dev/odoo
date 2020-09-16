/** @odoo-module alias=mail.views.Activity.tests **/

import ActivityView from 'mail.views.Activity';

import { createActionManager, createView } from 'web.test_utils';
import { click } from 'web.test_utils_dom';
import { editAndTrigger } from 'web.test_utils_fields';

QUnit.module('mail', {}, function () {
QUnit.module('views', {}, function () {
QUnit.module('Activity', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        this.data = {
            'mail.activity': {
                fields: {
                    activity_type_id: {
                        relation: 'mail.activity.type',
                        string: "Activity type",
                        type: 'many2one',
                    },
                    can_write: {
                        string: "Can write",
                        type: 'boolean',
                    },
                    date_deadline: {
                        string: "Due Date",
                        type: 'date',
                    },
                    display_name: {
                        string: "Display name",
                        type: 'char',
                    },
                    mail_template_ids: {
                        relation: 'mail.template',
                        string: "Mail templates",
                        type: 'many2many',
                    },
                    res_id: {
                        string: "Related document id",
                        type: 'integer',
                    },
                    state: {
                        selection: [
                            ['overdue', 'Overdue'],
                            ['today', 'Today'],
                            ['planned', 'Planned'],
                        ],
                        string: "State",
                        type: 'selection',
                    },
                    user_id: {
                        relation: 'partner',
                        string: "Assigned to",
                        type: 'many2one',
                    },
                },
                records:[
                    {
                        activity_type_id: 1,
                        can_write: true,
                        date_deadline: moment().add(3, "days").format("YYYY-MM-DD"), // now
                        display_name: "An activity",
                        id: 1,
                        mail_template_ids: [8, 9],
                        res_id: 13,
                        state: 'planned',
                        user_id: 2,
                    },
                    {
                        activity_type_id: 1,
                        can_write: true,
                        date_deadline: moment().format("YYYY-MM-DD"), // now
                        display_name: "An activity",
                        id: 2,
                        mail_template_ids: [8, 9],
                        res_id: 30,
                        state: 'today',
                        user_id: 2,
                    },
                    {
                        activity_type_id: 2,
                        can_write: true,
                        date_deadline: moment().subtract(2, "days").format("YYYY-MM-DD"), // now
                        display_name: "An activity",
                        id: 3,
                        mail_template_ids: [],
                        res_id: 30,
                        state: 'overdue',
                        user_id: 2,
                    },
                ],
            },
            'mail.activity.type': {
                fields: {
                    mail_template_ids: {
                        relation: 'mail.template',
                        string: "Mail templates",
                        type: 'many2many',
                    },
                    name: {
                        string: "Name",
                        type: 'char',
                    },
                },
                records: [
                    {
                        id: 1,
                        mail_template_ids: [8, 9],
                        name: "Email",
                    },
                    { id: 2, name: "Call" },
                    { id: 3, name: "Call for Demo" },
                    { id: 4, name: "To Do" },
                ],
            },
            'mail.template': {
                fields: {
                    name: {
                        string: "Name",
                        type: 'char',
                    },
                },
                records: [
                    { id: 8, name: "Template1" },
                    { id: 9, name: "Template2" },
                ],
            },
            partner: {
                fields: {
                    display_name: {
                        string: "Displayed name",
                        type: 'char',
                    },
                },
                records: [
                    {
                        display_name: "first partner",
                        id: 2,
                    },
                ],
            },
            task: {
                fields: {
                    activity_ids: {
                        relation: 'mail.activity',
                        relation_field: 'res_id',
                        string: "Activities",
                        type: 'one2many',
                    },
                    foo: {
                        string: "Foo",
                        type: 'char',
                    },
                    id: {
                        string: "ID",
                        type: 'integer',
                    },
                },
                records: [
                    {
                        activity_ids: [1],
                        foo: "Meeting Room Furnitures",
                        id: 13,
                    },
                    {
                        activity_ids: [2, 3],
                        foo: "Office planning",
                        id: 30,
                    },
                ],
            },
        };
    }
});

function activityDateFormat(date) {
    return date.toLocaleDateString(
        moment().locale(),
        { day: 'numeric', month: 'short' },
    );
}

QUnit.test('activity view: simple activity rendering', async function (assert) {
    assert.expect(14);

    const activity = await createView({
        arch: `
            <activity string="Task">
                <templates>
                    <div t-name="activity-box">
                        '<field name="foo"/>
                    </div>
                </templates>
            </activity>
        `,
        data: this.data,
        intercepts: {
            do_action(ev) {
                assert.deepEqual(
                    ev.data.action,
                    {
                        context: {
                            default_activity_type_id: 3,
                            default_res_id: 30,
                            default_res_model: 'task',
                        },
                        res_id: false,
                        res_model: 'mail.activity',
                        target: 'new',
                        type: 'ir.actions.act_window',
                        view_mode: 'form',
                        view_type: 'form',
                        views: [[false, 'form']],
                    },
                    "should do a do_action with correct parameters",
                );
                ev.data.options.on_close();
            },
        },
        model: 'task',
        View: ActivityView,
    });

    assert.containsOnce(
        activity,
        'table',
        "should have a table",
    );
    const $th1 = activity.$(`
        table
        thead
        tr:first
        th:nth-child(2)
    `);
    assert.containsOnce(
        $th1,
        'span:first:contains(Email)',
        `should contain "Email" in header of first column`,
    );
    assert.containsOnce(
        $th1,
        '.o_kanban_counter',
        "should contain a progressbar in header of first column",
    );
    assert.hasAttrValue(
        $th1.find(`
            .o_kanban_counter_progress
            .progress-bar:first
        `),
        'data-original-title',
        "1 Planned",
        "the counter progressbars should be correctly displayed",
    );
    assert.hasAttrValue(
        $th1.find(`
            .o_kanban_counter_progress
            .progress-bar:nth-child(2)
        `),
        'data-original-title',
        "1 Today",
        "the counter progressbars should be correctly displayed",
    );
    const $th2 = activity.$(`
        table
        thead
        tr:first
        th:nth-child(3)
    `);
    assert.containsOnce(
        $th2,
        'span:first:contains(Call)',
        `should contain "Call" in header of second column`
    );
    assert.hasAttrValue(
        $th2.find(`
            .o_kanban_counter_progress
            .progress-bar:nth-child(3)
        `),
        'data-original-title',
        "1 Overdue",
        "the counter progressbars should be correctly displayed",
    );
    assert.containsNone(
        activity,
        `
            table
            thead
            tr:first
            th:nth-child(4)
            .o_kanban_counter
        `,
        "should not contain a progressbar in header of 3rd column",
    );
    assert.ok(
        activity.$(`
            table
            tbody
            tr:first
            td:first:contains(Office planning)
        `).length,
        `should contain "Office planning" in first colum of first row`,
    );
    assert.ok(
        activity.$(`
            table
            tbody
            tr:nth-child(2)
            td:first:contains(Meeting Room Furnitures)
        `).length,
        `should contain "Meeting Room Furnitures" in first colum of second row`,
    );
    const today = activityDateFormat(new Date());
    assert.ok(
        activity.$(`
            table
            tbody
            tr:first
            td:nth-child(2).today
            .o_closest_deadline:contains('${today}')
        `).length,
        `should contain an activity for today in second cell of first line ${today}`,
    );
    const td = `
        table
        tbody
        tr:nth-child(1)
        td.o_activity_empty_cell
    `;
    assert.containsN(
        activity,
        td,
        2,
        "should contain an empty cell as no activity scheduled yet.",
    );

    // schedule an activity (this triggers a do_action)
    await editAndTrigger(
        activity.$(`${td}:first`),
        null,
        ['mouseenter', 'click'],
    );
    assert.containsOnce(
        activity,
        `
            table
            tfoot
            tr
            .o_record_selector
        `,
        "should contain search more selector to choose the record to schedule an activity for it",
    );

    activity.destroy();
});

QUnit.test('activity view: no content rendering', async function (assert) {
    assert.expect(2);

    // reset incompatible setup
    this.data['mail.activity'].records = [];
    this.data['mail.activity.type'].records = [];
    for (const task of this.data.task.records) {
        task.activity_ids = false;
    }

    const activity = await createView({
        arch: `
            <activity string="Task">
                <templates>
                    <div t-name="activity-box">
                        <field name="foo"/>
                    </div>
                </templates>
            </activity>
        `,
        data: this.data,
        model: 'task',
        View: ActivityView,
    });
    assert.containsOnce(
        activity,
        '.o_view_nocontent',
        "should display the no content helper",
    );
    assert.strictEqual(
        activity.$(`
            .o_view_nocontent
            .o_view_nocontent_empty_folder
        `).text().trim(),
        "No data to display",
        "should display the no content helper text",
    );

    activity.destroy();
});

QUnit.test('activity view: batch send mail on activity', async function (assert) {
    assert.expect(6);

    const activity = await createView({
        arch: `
            <activity string="Task">
                <templates>
                    <div t-name="activity-box">
                        <field name="foo"/>
                    </div>
                </templates>
            </activity>
        `,
        data: this.data,
        async mockRPC(route, args) {
            if (args.method === 'activity_send_mail'){
                assert.step(JSON.stringify(args.args));
                return;
            }
            return this._super(...arguments);
        },
        model: 'task',
        View: ActivityView,
    });
    assert.notOk(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            .dropdown-menu.show
        `).length,
        "dropdown shouldn't be displayed",
    );

    click(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            i.fa-ellipsis-v
        `),
    );
    assert.ok(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            .dropdown-menu.show
        `).length,
        "dropdown should have appeared",
    );

    click(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            .dropdown-menu.show
            .o_send_mail_template:contains(Template2)
        `),
    );
    assert.notOk(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            .dropdown-menu.show
        `).length,
        "dropdown shouldn't be displayed",
    );

    click(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            i.fa-ellipsis-v
        `),
    );
    click(
        activity.$(`
            table
            thead
            tr:first
            th:nth-child(2)
            span:nth-child(2)
            .dropdown-menu.show
            .o_send_mail_template:contains(Template1)
        `),
    );
    assert.verifySteps([
        '[[13,30],9]', // send mail template 9 on tasks 13 and 30
        '[[13,30],8]',  // send mail template 8 on tasks 13 and 30
    ]);

    activity.destroy();
});

QUnit.test('activity view: activity widget', async function (assert) {
    assert.expect(16);

    var activity = await createView({
        arch: `
            <activity string="Task">
                <templates>
                    <div t-name="activity-box">
                        <field name="foo"/>
                    </div>
                </templates>
            </activity>
        `,
        data: this.data,
        intercepts: {
            do_action(ev) {
                const action = ev.data.action;
                if (action.serverGeneratedAction) {
                    assert.step('serverGeneratedAction');
                } else if (action.res_model === 'mail.compose.message') {
                    assert.deepEqual(
                        {
                            default_model: "task",
                            default_res_id: 30,
                            default_template_id: 8,
                            default_use_template: true,
                            force_email: true
                        },
                        action.context,
                    );
                    assert.step('do_action_compose');
                } else if (action.res_model === 'mail.activity') {
                    assert.deepEqual(
                        {
                            default_res_id: 30,
                            default_res_model: 'task',
                        },
                        action.context,
                    );
                    assert.step('do_action_activity');
                } else {
                    assert.step('Unexpected action');
                }
            },
        },
        async mockRPC(route, args) {
            if (args.method === 'activity_send_mail'){
                assert.deepEqual(
                    [[30],8],
                    args.args,
                    "Should send template 8 on record 30",
                );
                assert.step('activity_send_mail');
                return;
            }
            if (args.method === 'action_feedback_schedule_next'){
                assert.deepEqual(
                    [[3]],
                    args.args,
                    "Should execute action_feedback_schedule_next on activity 3 only",
                );
                assert.strictEqual(
                    args.kwargs.feedback,
                    "feedback2",
                );
                assert.step('action_feedback_schedule_next');
                return { serverGeneratedAction: true };
            }
            return this._super(...arguments);
        },
        model: 'task',
        View: ActivityView,
    });
    const today = activity.$(`
        table
        tbody
        tr:first
        td:nth-child(2).today
    `);
    let dropdown = today.find('.dropdown-menu.o_activity');
    await click(today.find('.o_closest_deadline'));
    assert.hasClass(
        dropdown,
        'show',
        "dropdown should be displayed",
    );
    assert.ok(
        dropdown.find('.o_activity_color_today:contains(Today)').length,
        "Title should be today",
    );
    assert.ok(
        dropdown.find(`
            .o_activity_title_entry[data-activity-id="2"]:first
            div:contains(template8)
        `).length,
        "template8 should be available",
    );
    assert.ok(
        dropdown.find(`
            .o_activity_title_entry[data-activity-id="2"]:eq(1)
            div:contains(template9)
        `).length,
        "template9 should be available",
    );

    await click(
        dropdown.find(`
            .o_activity_title_entry[data-activity-id="2"]:first
            .o_activity_template_preview
        `),
    );
    await click(
        dropdown.find(`
            .o_activity_title_entry[data-activity-id="2"]:first
            .o_activity_template_send
        `),
    );
    const overdue = activity.$(`
        table
        tbody
        tr:first
        td:nth-child(3).overdue
    `);
    await click(overdue.find('.o_closest_deadline'));
    dropdown = overdue.find('.dropdown-menu.o_activity');
    assert.notOk(
        dropdown.find(`
            .o_activity_title
            div
            div
            div:first
            span
        `).length,
        "No template should be available",
    );

    await click(dropdown.find('.o_schedule_activity'));
    await click(overdue.find('.o_closest_deadline'));
    await click(dropdown.find('.o_mark_as_done'));
    dropdown.find('#activity_feedback').val("feedback2");
    await click(dropdown.find('.o_activity_popover_done_next'));
    assert.verifySteps([
        'do_action_compose',
        'activity_send_mail',
        'do_action_activity',
        'action_feedback_schedule_next',
        'serverGeneratedAction',
    ]);

    activity.destroy();
});
QUnit.test('activity view: no group_by_menu and no comparison_menu', async function (assert) {
    assert.expect(4);

    const actionManager = await createActionManager({
        actions: [
            {
                id: 1,
                name: "Task Action",
                res_model: 'task',
                type: 'ir.actions.act_window',
                views: [[false, 'activity']],
            },
        ],
        archs: {
            'task,false,activity': `
                <activity string="Task">
                    <templates>
                        <div t-name="activity-box">
                            <field name="foo"/>
                        </div>
                    </templates>
                </activity>
            `,
            'task,false,search': '<search/>',
        },
        data: this.data,
        async mockRPC(route, args) {
            if (args.method === 'get_activity_data') {
                assert.deepEqual(
                    args.kwargs.context,
                    { lang: 'zz_ZZ' },
                    "The context should have been passed",
                );
            }
            return this._super(...arguments);
        },
        session: {
            user_context: { lang: 'zz_ZZ' },
        },
    });
    await actionManager.doAction(1);
    assert.containsN(
        actionManager,
        `
            .o_search_options
            .o_dropdown button:visible
        `,
        2,
        "only two elements should be available in view search",
    );
    assert.isVisible(
        actionManager.$(`
            .o_search_options
            .o_dropdown.o_filter_menu
            > button
        `),
        "filter should be available in view search",
    );
    assert.isVisible(
        actionManager.$(`
            .o_search_options
            .o_dropdown.o_favorite_menu
            > button
        `),
        "favorites should be available in view search",
    );

    actionManager.destroy();
});

QUnit.test('activity view: search more to schedule an activity for a record of a respecting model', async function (assert) {
    assert.expect(5);

    Object.assign(this.data.task.fields, {
        name: {
            string: "Name",
            type: 'char',
        },
    });
    this.data.task.records[2] = {
        id: 31,
        name: "Task 3",
    };
    const activity = await createView({
        arch: `
            <activity string="Task">
                <templates>
                    <div t-name="activity-box">
                        <field name="foo"/>
                    </div>
                </templates>
            </activity>
        `,
        archs: {
            'task,false,list': `
                <tree string="Task">
                    <field name="name"/>
                </tree>
            `,
            'task,false,search': '<search></search>',
        },
        data: this.data,
        intercepts: {
            do_action(ev) {
                assert.step('doAction');
                assert.deepEqual(
                    ev.data.action,
                    {
                        context: {
                            default_res_id: {
                                display_name: undefined,
                                id: 31,
                            },
                            default_res_model: 'task',
                        },
                        name: 'Schedule Activity',
                        res_id: false,
                        res_model: 'mail.activity',
                        target: 'new',
                        type: 'ir.actions.act_window',
                        view_mode: 'form',
                        views: [[false, 'form']],
                    },
                    "should execute an action with correct params",
                );
                ev.data.options.on_close();
            },
        },
        async mockRPC(route, args) {
            if (args.method === 'name_search') {
                args.kwargs.name = "Task";
            }
            return this._super(...arguments);
        },
        model: 'task',
        View: ActivityView,
    });
    assert.containsOnce(
        activity,
        `
            table
            tfoot
            tr
            .o_record_selector
        `,
        "should contain search more selector to choose the record to schedule an activity for it",
    );

    await click(
        activity.$(`
            table
            tfoot
            tr
            .o_record_selector
        `),
    );
    // search create dialog
    const $modal = $('.modal-lg');
    assert.strictEqual(
        $modal.find('.o_data_row').length,
        3,
        "all tasks should be available to select",
    );

    // select a record to schedule an activity for it (this triggers a do_action)
    click($modal.find('.o_data_row:last'));
    assert.verifySteps(['doAction']);

    activity.destroy();
});

QUnit.test('Activity view: discard an activity creation dialog', async function (assert) {
    assert.expect(2);

    const actionManager = await createActionManager({
        actions: [
            {
                id: 1,
                name: "Task Action",
                res_model: 'task',
                type: 'ir.actions.act_window',
                views: [[false, 'activity']],
            },
        ],
        archs: {
            'task,false,activity': `
                <activity string="Task">
                    <templates>
                        <div t-name="activity-box">
                            <field name="foo"/>
                        </div>
                    </templates>
                </activity>`,
            'task,false,search': '<search></search>',
            'mail.activity,false,form': `
                <form>
                    <field name="display_name"/>
                    <footer>
                        <button string="Discard" class="btn-secondary" special="cancel"/>
                    </footer>
                </form>`,
        },
        data: this.data,
        intercepts: {
            do_action(ev) {
                actionManager.doAction(ev.data.action, ev.data.options);
            }
        },
        async mockRPC(route, args) {
            if (args.method === 'check_access_rights') {
                return true;
            }
            return this._super(...arguments);
        },
    });
    await actionManager.doAction(1);
    await click(
        actionManager.$(`
            .o_activity_view
            .o_data_row
            .o_activity_empty_cell
        `)[0],
    );
    assert.containsOnce(
        $,
        '.modal.o_technical_modal.show',
        "Activity Modal should be opened",
    );

    await click($('.modal.o_technical_modal.show button[special="cancel"]'));
    assert.containsNone(
        $,
        '.modal.o_technical_modal.show',
        "Activity Modal should be closed",
    );

    actionManager.destroy();
});

});
});
});
