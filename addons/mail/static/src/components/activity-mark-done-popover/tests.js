/** @odoo-module alias=mail.components.ActivityMarkDonePopover.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import Bus from 'web.Bus';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ActivityMarkDonePopover', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('activity mark done popover simplest layout', async function (assert) {
    assert.expect(6);

    createServer(this.data);
    const env = await createEnv();
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            canWrite: true,
            category: 'not_upload_file',
            id: 12,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 42,
                    model: 'res.partner',
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMarkDonePopover',
        { activity },
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover',
        "Popover component should be present",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-feedback',
        "Popover component should contain the feedback textarea",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-buttons',
        "Popover component should contain the action buttons",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-doneScheduleNextButton',
        "Popover component should contain the done & schedule next button",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-doneButton',
        "Popover component should contain the done button",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-discardButton',
        "Popover component should contain the discard button",
    );
});

QUnit.test('activity with force next mark done popover simplest layout', async function (assert) {
    assert.expect(6);

    createServer(this.data);
    const env = await createEnv();
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            canWrite: true,
            category: 'not_upload_file',
            chainingType: 'trigger',
            id: 12,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 42,
                    model: 'res.partner',
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMarkDonePopover',
        { activity },
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover',
        "Popover component should be present",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-feedback',
        "Popover component should contain the feedback textarea",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-buttons',
        "Popover component should contain the action buttons",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-doneScheduleNextButton',
        "Popover component should contain the done & schedule next button",
    );
    assert.containsNone(
        document.body,
        '.o-ActivityMarkDonePopover-doneButton',
        "Popover component should NOT contain the done button",
    );
    assert.containsOnce(
        document.body,
        '.o-ActivityMarkDonePopover-discardButton',
        "Popover component should contain the discard button",
    );
});

QUnit.test('activity mark done popover mark done without feedback', async function (assert) {
    assert.expect(7);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route === '/web/dataset/call_kw/mail.activity/action_feedback') {
                assert.step('action_feedback');
                assert.strictEqual(args.args.length, 1);
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], 12);
                assert.strictEqual(args.kwargs.attachment_ids.length, 0);
                assert.notOk(args.kwargs.feedback);
                return;
            }
            if (route === '/web/dataset/call_kw/mail.activity/unlink') {
                // 'unlink' on non-existing record raises a server crash
                throw new Error("'unlink' RPC on activity must not be called (already unlinked from mark as done)");
            }
            return this._super(...arguments);
        },
    });
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            canWrite: true,
            category: 'not_upload_file',
            id: 12,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 42,
                    model: 'res.partner',
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMarkDonePopover',
        { activity },
    );
    document.querySelector('.o-ActivityMarkDonePopover-doneButton').click();
    assert.verifySteps(
        ['action_feedback'],
        "Mark done and schedule next button should call the right rpc",
    );
});

QUnit.test('activity mark done popover mark done with feedback', async function (assert) {
    assert.expect(7);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route === '/web/dataset/call_kw/mail.activity/action_feedback') {
                assert.step('action_feedback');
                assert.strictEqual(args.args.length, 1);
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], 12);
                assert.strictEqual(args.kwargs.attachment_ids.length, 0);
                assert.strictEqual(args.kwargs.feedback, 'This task is done');
                return;
            }
            if (route === '/web/dataset/call_kw/mail.activity/unlink') {
                // 'unlink' on non-existing record raises a server crash
                throw new Error("'unlink' RPC on activity must not be called (already unlinked from mark as done)");
            }
            return this._super(...arguments);
        },
    });
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            canWrite: true,
            category: 'not_upload_file',
            id: 12,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 42,
                    model: 'res.partner',
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMarkDonePopover',
        { activity },
    );
    let feedbackTextarea = document.querySelector('.o-ActivityMarkDonePopover-feedback');
    feedbackTextarea.focus();
    document.execCommand(
        'insertText',
        false,
        "This task is done",
    );
    document.querySelector('.o-ActivityMarkDonePopover-doneButton').click();
    assert.verifySteps(
        ['action_feedback'],
        "Mark done and schedule next button should call the right rpc",
    );
});

QUnit.test('activity mark done popover mark done and schedule next', async function (assert) {
    assert.expect(6);

    const bus = new Bus();
    bus.on(
        'do-action',
        null,
        payload => {
            assert.step('activity_action');
            throw new Error("The do-action event should not be triggered when the route doesn't return an action");
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route === '/web/dataset/call_kw/mail.activity/action_feedback_schedule_next') {
                assert.step('action_feedback_schedule_next');
                assert.strictEqual(args.args.length, 1);
                assert.strictEqual(args.args[0].length, 1);
                assert.strictEqual(args.args[0][0], 12);
                assert.strictEqual(args.kwargs.feedback, "This task is done");
                return false;
            }
            if (route === '/web/dataset/call_kw/mail.activity/unlink') {
                // 'unlink' on non-existing record raises a server crash
                throw new Error("'unlink' RPC on activity must not be called (already unlinked from mark as done)");
            }
            return this._super(...arguments);
        },
        env: { bus },
    });
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            canWrite: true,
            category: 'not_upload_file',
            id: 12,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 42,
                    model: 'res.partner',
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMarkDonePopover',
        { activity },
    );
    let feedbackTextarea = document.querySelector('.o-ActivityMarkDonePopover-feedback');
    feedbackTextarea.focus();
    document.execCommand(
        'insertText',
        false,
        "This task is done",
    );
    await afterNextRender(
        () => document.querySelector('.o-ActivityMarkDonePopover-doneScheduleNextButton').click(),
    );
    assert.verifySteps(
        ['action_feedback_schedule_next'],
        "Mark done and schedule next button should call the right rpc and not trigger an action",
    );
});

QUnit.test('[technical] activity mark done & schedule next with new action', async function (assert) {
    assert.expect(3);

    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.step('activity_action');
        assert.deepEqual(
            payload.action,
            { type: 'ir.actions.act_window' },
            "The content of the action should be correct",
        );
    });
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route === '/web/dataset/call_kw/mail.activity/action_feedback_schedule_next') {
                return { type: 'ir.actions.act_window' };
            }
            return this._super(...arguments);
        },
        env: { bus },
    });
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            canWrite: true,
            category: 'not_upload_file',
            id: 12,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 42,
                    model: 'res.partner',
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMarkDonePopover',
        { activity },
    );
    await afterNextRender(
        () => document.querySelector('.o-ActivityMarkDonePopover-doneScheduleNextButton').click(),
    );
    assert.verifySteps(
        ['activity_action'],
        "The action returned by the route should be executed",
    );
});

});
});
});
