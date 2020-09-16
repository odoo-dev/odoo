/** @odoo-module alias=mail.models.Messaging.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('models', {}, function () {
QUnit.module('Messaging', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('openChat: display notification for partner without user', async function (assert) {
    assert.expect(2);

    this.data['res.partner'].records.push(
        { id: 14 },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Messaging/openChat',
        env.services.model.messaging,
        { partnerId: 14 },
    );
    assert.containsOnce(
        document.body,
        '.toast .o_notification_content',
        "should display a toast notification after failing to open chat",
    );
    assert.strictEqual(
        document.querySelector('.o_notification_content').textContent,
        "You can only chat with partners that have a dedicated user.",
        "should display the correct information in the notification",
    );
});

QUnit.test('openChat: display notification for wrong user', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    // user id not in this.data
    await env.services.action.dispatch(
        'Messaging/openChat',
        env.services.model.messaging,
        { userId: 14 },
    );
    assert.containsOnce(
        document.body,
        '.toast .o_notification_content',
        "should display a toast notification after failing to open chat",
    );
    assert.strictEqual(
        document.querySelector('.o_notification_content').textContent,
        "You can only chat with existing users.",
        "should display the correct information in the notification",
    );
});

QUnit.test('openChat: open new chat for user', async function (assert) {
    assert.expect(3);

    this.data['res.partner'].records.push(
        { id: 14 }
    );
    this.data['res.users'].records.push(
        {
            id: 11,
            partner_id: 14,
        }
    );
    createServer(this.data);
    const env = await createEnv();
    const existingChat = env.services.action.dispatch(
        'Thread/find',
        thread => (
            thread.channelType() === 'chat' &&
            thread.correspondent() &&
            thread.correspondent().id() === 14 &&
            thread.model() === 'mail.channel' &&
            thread.public() === 'private'
        ),
    );
    assert.notOk(
        existingChat,
        "a chat should not exist with the target partner initially",
    );

    await env.services.action.dispatch(
        'Messaging/openChat',
        env.services.model.messaging,
        { partnerId: 14 },
    );
    const chat = env.services.action.dispatch(
        'Thread/find',
        thread => (
            thread.channelType() === 'chat' &&
            thread.correspondent() &&
            thread.correspondent().id() === 14 &&
            thread.model() === 'mail.channel' &&
            thread.public() === 'private'
        ),
    );
    assert.ok(
        chat,
        "a chat should exist with the target partner",
    );
    assert.strictEqual(
        chat.threadViews().length,
        1,
        "the chat should be displayed in a 'ThreadView'",
    );
});

QUnit.test('openChat: open existing chat for user', async function (assert) {
    assert.expect(5);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 10,
            members: [this.data.currentPartnerId, 14],
            public: 'private',
        },
    );
    this.data['res.partner'].records.push(
        { id: 14 },
    );
    this.data['res.users'].records.push(
        {
            id: 11,
            partner_id: 14,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const existingChat = env.services.action.dispatch(
        'Thread/find',
        thread => (
            thread.channelType() === 'chat' &&
            thread.correspondent() &&
            thread.correspondent().id() === 14 &&
            thread.model() === 'mail.channel' &&
            thread.public() === 'private'
        ),
    );
    assert.ok(
        existingChat,
        "a chat should initially exist with the target partner",
    );
    assert.strictEqual(
        existingChat.threadViews().length,
        0,
        "the chat should not be displayed in a 'ThreadView'",
    );

    await env.services.action.dispatch(
        'Messaging/openChat',
        env.services.model.messaging,
        { partnerId: 14 },
    );
    assert.ok(
        existingChat,
        "a chat should still exist with the target partner",
    );
    assert.strictEqual(
        existingChat.id(),
        10,
        "the chat should be the existing chat",
    );
    assert.strictEqual(
        existingChat.threadViews().length,
        1,
        "the chat should now be displayed in a 'ThreadView'",
    );
});

});
});
});
