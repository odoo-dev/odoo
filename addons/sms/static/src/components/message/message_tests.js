/** @odoo-module alias=sms.components.Message.tests **/

import makeDeferred from 'mail.utils.makeDeferred';
import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import Bus from 'web.Bus';

QUnit.module('sms', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Message', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('Notification Sent', async function (assert) {
    assert.expect(9);

    createServer(this.data);
    const env = await createEnv();
    const threadViewer = env.services.action.dispatch(
        'ThreadViewer/create',
        {
            $$$hasThreadView: true,
            $$$thread: env.services.action.dispatch(
                'RecordFieldCommand/create',
                {
                    $$$id: 11,
                    $$$model: 'mail.channel',
                },
            ),
        },
    );
    const message = env.services.action.dispatch(
        'Message/create',
        {
            $$$id: 10,
            $$$notifications: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$id: 11,
                    $$$partner: env.services.action.dispatch(
                        'RecordFieldCommand/insert',
                        {
                            $$$id: 12,
                            $$$name: "Someone",
                        },
                    ),
                    $$$status: 'sent',
                    $$$type: 'sms',
                },
            ),
            $$$originThread: env.services.action.dispatch(
                'RecordFieldCommand/link',
                threadViewer.$$$thread(),
            ),
            $$$type: 'sms',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        {
            message,
            threadView: threadViewer.$$$threadView(),
        },
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIconClickable',
        "should display the notification icon container",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIcon',
        "should display the notification icon",
    );
    assert.hasClass(
        document.querySelector('.o-Message-notificationIcon'),
        'fa-mobile',
        "icon should represent sms",
    );

    await afterNextRender(
        () => document.querySelector('.o-Message-notificationIconClickable').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationPopover',
        "notification popover should be open",
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationPopover-notificationIcon',
        "popover should have one icon",
    );
    assert.hasClass(
        document.querySelector('.o-NotificationPopover-notificationIcon'),
        'fa-check',
        "popover should have the sent icon",
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationPopover-notificationPartnerName',
        "popover should have the partner name",
    );
    assert.strictEqual(
        document.querySelector('.o-NotificationPopover-notificationPartnerName').textContent.trim(),
        "Someone",
        "partner name should be correct",
    );
});

QUnit.test('Notification Error', async function (assert) {
    assert.expect(8);

    const openResendActionDef = makeDeferred();
    const bus = new Bus();
    bus.on(
        'do-action',
        null,
        payload => {
            assert.step('do_action');
            assert.strictEqual(
                payload.action,
                'sms.sms_resend_action',
                "action should be the one to resend sms",
            );
            assert.strictEqual(
                payload.options.additional_context.default_mail_message_id,
                10,
                "action should have correct message id",
            );
            openResendActionDef.resolve();
        },
    );
    createServer(this.data);
    const env = await createEnv({
        env: { bus },
    });
    const threadViewer = env.services.action.dispatch(
        'ThreadViewer/create',
        {
            $$$hasThreadView: true,
            $$$thread: env.services.action.dispatch(
                'RecordFieldCommand/create',
                {
                    $$$id: 11,
                    $$$model: 'mail.channel',
                },
            ),
        },
    );
    const message = env.services.action.dispatch(
        'Message/create',
        {
            $$$id: 10,
            $$$notifications: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$id: 11,
                    $$$status: 'exception',
                    $$$type: 'sms',
                },
            ),
            $$$originThread: env.services.action.dispatch(
                'RecordFieldCommand/link',
                threadViewer.$$$thread(),
            ),
            $$$type: 'sms',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        {
            message,
            threadView: threadViewer.$$$threadView(),
        },
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIconClickable',
        "should display the notification icon container",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIcon',
        "should display the notification icon",
    );
    assert.hasClass(
        document.querySelector('.o-Message-notificationIcon'),
        'fa-mobile',
        "icon should represent sms",
    );

    document.querySelector('.o-Message-notificationIconClickable').click();
    await openResendActionDef;
    assert.verifySteps(
        ['do_action'],
        "should do an action to display the resend sms dialog",
    );
});

});
});
});
