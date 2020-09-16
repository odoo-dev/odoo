/** @odoo-module alias=mail.components.Discuss.inboxTests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';

import Bus from 'web.Bus';
import { click } from 'web.test_utils_dom';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Discuss', {}, function () {
QUnit.module('inboxTests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('reply: discard on pressing escape', async function (assert) {
    assert.expect(9);

    // message expected to be found in inbox
    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'res.partner',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    // partner expected to be found by mention
    this.data['res.partner'].records.push(
        {
            email: "testpartnert@odoo.com",
            id: 11,
            name: "TestPartner",
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "should have composer after clicking on reply to message",
    );

    await afterNextRender(
        () => click('.o-Composer-buttonEmojis'),
    );
    assert.containsOnce(
        document.body,
        '.o-EmojisPopover',
        "emojis popover should be opened after click on emojis button",
    );

    await afterNextRender(
        () => {
            const ev = new window.KeyboardEvent(
                'keydown',
                {
                    bubbles: true,
                    key: 'Escape',
                },
            );
            document.querySelector('.o-Composer-buttonEmojis').dispatchEvent(ev);
        },
    );
    assert.containsNone(
        document.body,
        '.o-EmojisPopover',
        "emojis popover should be closed after pressing escape on emojis button",
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "reply composer should still be opened after pressing escape on emojis button",
    );

    await afterNextRender(
        () => {
            document.querySelector('.o-ComposerTextInput-textarea').focus();
            document.execCommand(
                'insertText',
                false,
                "@",
            );
            document.querySelector('.o-ComposerTextInput-textarea')
                .dispatchEvent(new window.KeyboardEvent('keydown'));
            document.querySelector('.o-ComposerTextInput-textarea')
                .dispatchEvent(new window.KeyboardEvent('keyup'));
            document.execCommand(
                'insertText',
                false,
                "T",
            );
            document.querySelector('.o-ComposerTextInput-textarea')
                .dispatchEvent(new window.KeyboardEvent('keydown'));
            document.querySelector('.o-ComposerTextInput-textarea')
                .dispatchEvent(new window.KeyboardEvent('keyup'));
            document.execCommand(
                'insertText',
                false,
                "e",
            );
            document.querySelector('.o-ComposerTextInput-textarea')
                .dispatchEvent(new window.KeyboardEvent('keydown'));
            document.querySelector('.o-ComposerTextInput-textarea')
                .dispatchEvent(new window.KeyboardEvent('keyup'));
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "mention suggestion should be opened after typing @",
    );

    await afterNextRender(
        () => {
            const ev = new window.KeyboardEvent(
                'keydown',
                {
                    bubbles: true,
                    key: 'Escape',
                },
            );
            document.querySelector('.o-ComposerTextInput-textarea').dispatchEvent(ev);
        },
    );
    assert.containsNone(
        document.body,
        '.o-ComposerSuggestion',
        "mention suggestion should be closed after pressing escape on mention suggestion",
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "reply composer should still be opened after pressing escape on mention suggestion",
    );

    await afterNextRender(
        () => {
            const ev = new window.KeyboardEvent(
                'keydown',
                {
                    bubbles: true,
                    key: 'Escape',
                },
            );
            document.querySelector('.o-ComposerTextInput-textarea').dispatchEvent(ev);
        },
    );
    assert.containsNone(
        document.body,
        '.o-Composer',
        "reply composer should be closed after pressing escape if there was no other priority escape handler",
    );
});

QUnit.test('reply: discard on discard button click', async function (assert) {
    assert.expect(4);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'res.partner',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "should have composer after clicking on reply to message",
    );
    assert.containsOnce(
        document.body,
        '.o-Composer-buttonDiscard',
        "composer should have a discard button",
    );

    await afterNextRender(
        () => click('.o-Composer-buttonDiscard'),
    );
    assert.containsNone(
        document.body,
        '.o-Composer',
        "reply composer should be closed after clicking on discard",
    );
});

QUnit.test('reply: discard on reply button toggle', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'res.partner',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "should have composer after clicking on reply to message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.containsNone(
        document.body,
        '.o-Composer',
        "reply composer should be closed after clicking on reply button again",
    );
});

QUnit.test('reply: discard on click away', async function (assert) {
    assert.expect(7);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'res.partner',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "should have composer after clicking on reply to message",
    );

    click('.o-ComposerTextInput-textarea');
    await nextAnimationFrame(); // wait just in case, but nothing is supposed to happen
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "reply composer should still be there after clicking inside itself",
    );

    await afterNextRender(
        () => click('.o-Composer-buttonEmojis'),
    );
    assert.containsOnce(
        document.body,
        '.o-EmojisPopover',
        "emojis popover should be opened after clicking on emojis button",
    );

    await afterNextRender(
        () => click('.o-EmojisPopover-emoji'),
    );
    assert.containsNone(
        document.body,
        '.o-EmojisPopover',
        "emojis popover should be closed after selecting an emoji",
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "reply composer should still be there after selecting an emoji (even though it is technically a click away, it should be considered inside)",
    );

    await afterNextRender(
        () => click('.o-Message'),
    );
    assert.containsNone(
        document.body,
        '.o-Composer',
        "reply composer should be closed after clicking away",
    );
});

QUnit.test('"reply to" composer should log note if message replied to is a note', async function (assert) {
    assert.expect(6);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            is_discussion: false,
            model: 'res.partner',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'message_post') {
                assert.step('message_post');
                assert.strictEqual(
                    args.kwargs.message_type,
                    "comment",
                    "should set message type as 'comment'",
                );
                assert.strictEqual(
                    args.kwargs.subtype_xmlid,
                    "mail.mt_note",
                    "should set subtype_xmlid as 'note'",
                );
            }
            return this._super(...arguments);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.strictEqual(
        document.querySelector('.o-Composer-buttonSend').textContent.trim(),
        "Log",
        "Send button text should be 'Log'",
    );

    await afterNextRender(
        () => document.execCommand(
            'insertText',
            false,
            "Test",
        ),
    );
    await afterNextRender(
        () => click('.o-Composer-buttonSend'),
    );
    assert.verifySteps(['message_post']);
});

QUnit.test('"reply to" composer should send message if message replied to is not a note', async function (assert) {
    assert.expect(6);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            is_discussion: true,
            model: 'res.partner',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'message_post') {
                assert.step('message_post');
                assert.strictEqual(
                    args.kwargs.message_type,
                    "comment",
                    "should set message type as 'comment'",
                );
                assert.strictEqual(
                    args.kwargs.subtype_xmlid,
                    "mail.mt_comment",
                    "should set subtype_xmlid as 'comment'",
                );
            }
            return this._super(...arguments);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );

    await afterNextRender(
        () => click('.o-Message-commandReply'),
    );
    assert.strictEqual(
        document.querySelector('.o-Composer-buttonSend').textContent.trim(),
        "Send",
        "Send button text should be 'Send'",
    );

    await afterNextRender(
        () => document.execCommand(
            'insertText',
            false,
            "Test",
        ),
    );
    await afterNextRender(
        () => click('.o-Composer-buttonSend'),
    );
    assert.verifySteps(['message_post']);
});

QUnit.test('error notifications should not be shown in Inbox', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            id: 100,
            model: 'mail.channel',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            res_id: 20,
        },
    );
    this.data['mail.notification'].records.push(
        {
            mail_message_id: 100, // id of related message
            res_partner_id: this.data.currentPartnerId, // must be for current partner
            notification_status: 'exception',
            notification_type: 'email',
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-originThreadLink',
        "should display origin thread link",
    );
    assert.containsNone(
        document.body,
        '.o-Message-notificationIcon',
        "should not display any notification icon in Inbox",
    );
});

QUnit.test('show subject of message in Inbox', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'mail.channel', // random existing model
            needaction: true, // message_fetch domain
            needaction_partner_ids: [this.data.currentPartnerId], // not needed, for consistency
            subject: "Salutations, voyageur", // will be asserted in the test
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-subject',
        "should display subject of the message",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-subject').textContent,
        "Subject: Salutations, voyageur",
        "Subject of the message should be 'Salutations, voyageur'",
    );
});

QUnit.test('show subject of message in history', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            history_partner_ids: [3], // not needed, for consistency
            model: 'mail.channel', // random existing model
            subject: "Salutations, voyageur", // will be asserted in the test
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch(
            'Thread/findById',
            {
                id: 'history',
                model: 'mail.box',
            },
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-subject',
        "should display subject of the message",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-subject').textContent,
        "Subject: Salutations, voyageur",
        "Subject of the message should be 'Salutations, voyageur'",
    );
});

QUnit.test('click on (non-channel/non-partner) origin thread link should redirect to form view', async function (assert) {
    assert.expect(9);

    const bus = new Bus();
    bus.on(
        'do-action',
        null,
        payload => {
            // Callback of doing an action (action manager).
            // Expected to be called on click on origin thread link,
            // which redirects to form view of record related to origin thread
            assert.step('do-action');
            assert.strictEqual(
                payload.action.type,
                'ir.actions.act_window',
                "action should open a view",
            );
            assert.deepEqual(
                payload.action.views,
                [[false, 'form']],
                "action should open form view",
            );
            assert.strictEqual(
                payload.action.res_model,
                'some.model',
                "action should open view with model 'some.model' (model of message origin thread)",
            );
            assert.strictEqual(
                payload.action.res_id,
                10,
                "action should open view with id 10 (id of message origin thread)",
            );
        },
    );
    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'some.model',
            needaction: true,
            needaction_partner_ids: [this.data.currentPartnerId],
            record_name: "Some record",
            res_id: 10,
        },
    );
    this.data['some.model'] = {
        fields: {},
        records: [{ id: 10 }],
    };
    createServer(this.data);
    const env = await createEnv({
        env: { bus },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a single message",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-originThreadLink',
        "should display origin thread link",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-originThreadLink').textContent,
        "Some record",
        "origin thread link should display record name",
    );

    click('.o-Message-originThreadLink');
    assert.verifySteps(
        ['do-action'],
        "should have made an action on click on origin thread (to open form view)",
    );
});

});
});
});
