/** @odoo-module alias=mail.components.Chatter.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';

import { click } from 'web.test_utils.dom';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Chatter', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('base rendering when chatter has no attachment', async function (assert) {
    assert.expect(6);

    for (let i = 0; i < 60; i++) {
        this.data['mail.message'].records.push(
            {
                body: "not empty",
                model: 'res.partner',
                res_id: 100,
            },
        );
    }
    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "should have a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-attachmentBox',
        "should not have an attachment box in the chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-thread',
        "should have a thread in the chatter",
    );
    assert.strictEqual(
        document.querySelector('.o-Chatter-thread').dataset.threadLocalId,
        env.services.action.dispatch(
            'Thread/findById',
            {
                id: 100,
                model: 'res.partner',
            },
        ).localId,
        "thread should have the right thread local id",
    );
    assert.containsN(
        document.body,
        '.o-Message',
        30,
        "the first 30 messages of thread should be loaded",
    );
});

QUnit.test('base rendering when chatter has no record', async function (assert) {
    assert.expect(8);

    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        { threadModel: 'res.partner' },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "should have a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-attachmentBox',
        "should not have an attachment box in the chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-thread',
        "should have a thread in the chatter",
    );
    assert.ok(
        chatter.thread().isTemporary(),
        "thread should have a temporary thread linked to chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should have a message",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-content').textContent,
        "Creating a new record...",
        "should have the 'Creating a new record ...' message",
    );
    assert.containsNone(
        document.body,
        '.o-MessageList-loadMore',
        "should not have the 'load more' button",
    );
});

QUnit.test('base rendering when chatter has attachments', async function (assert) {
    assert.expect(3);

    this.data['ir.attachment'].records.push(
        {
            mimetype: 'text/plain',
            name: 'Blah.txt',
            res_id: 100,
            res_model: 'res.partner',
        },
        {
            mimetype: 'text/plain',
            name: 'Blu.txt',
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "should have a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-attachmentBox',
        "should not have an attachment box in the chatter",
    );
});

QUnit.test('show attachment box', async function (assert) {
    assert.expect(6);

    this.data['ir.attachment'].records.push(
        {
            mimetype: 'text/plain',
            name: 'Blah.txt',
            res_id: 100,
            res_model: 'res.partner',
        },
        {
            mimetype: 'text/plain',
            name: 'Blu.txt',
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        { id: 100 }
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "should have a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should have a counter",
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-attachmentBox',
        "should not have an attachment box in the chatter",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonAttachments'),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-attachmentBox',
        "should have an attachment box in the chatter",
    );
});

QUnit.test('composer show/hide on log note/send message [REQUIRE FOCUS]', async function (assert) {
    assert.expect(10);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage',
        "should have a send message button",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "should have a log note button",
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-composer',
        "should not have a composer",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-composer',
        "should have a composer",
    );
    assert.hasClass(
        document.querySelector('.o-Chatter-composer'),
        'o-isFocused',
        "composer 'send message' in chatter should have focus just after being displayed",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonLogNote'),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-composer',
        "should still have a composer",
    );
    assert.hasClass(
        document.querySelector('.o-Chatter-composer'),
        'o-isFocused',
        "composer 'log note' in chatter should have focus just after being displayed",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonLogNote'),
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-composer',
        "should have no composer anymore",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-composer',
        "should have a composer",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-composer',
        "should have no composer anymore",
    );
});

QUnit.test('should not display user notification messages in chatter', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push(
        {
            id: 102,
            message_type: 'user_notification',
            model: 'res.partner',
            res_id: 100,
        },
    );
    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsNone(
        document.body,
        '.o-Message',
        "should display no messages",
    );
});

QUnit.test('post message with "CTRL-Enter" keyboard shortcut', async function (assert) {
    assert.expect(2);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsNone(
        document.body,
        '.o-Message',
        "should not have any message initially in chatter",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    await afterNextRender(
        () => {
            document.querySelector('.o-ComposerTextInput-textarea').focus();
            document.execCommand(
                'insertText',
                false,
                "Test",
            );
        },
    );
    await afterNextRender(
        () => {
            const kevt = new window.KeyboardEvent(
                'keydown',
                { ctrlKey: true, key: "Enter" },
            );
            document.querySelector('.o-ComposerTextInput-textarea').dispatchEvent(kevt);
        },
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should now have single message in chatter after posting message from pressing 'CTRL-Enter' in text input of composer",
    );
});

QUnit.test('post message with "META-Enter" keyboard shortcut', async function (assert) {
    assert.expect(2);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsNone(
        document.body,
        '.o-Message',
        "should not have any message initially in chatter",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    await afterNextRender(
        () => {
            document.querySelector('.o-ComposerTextInput-textarea').focus();
            document.execCommand(
                'insertText',
                false,
                "Test",
            );
        },
    );
    await afterNextRender(
        () => {
            const kevt = new window.KeyboardEvent(
                'keydown',
                { key: "Enter", metaKey: true },
            );
            document.querySelector('.o-ComposerTextInput-textarea').dispatchEvent(kevt);
        },
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should now have single message in channel after posting message from pressing 'META-Enter' in text input of composer",
    );
});

QUnit.test('do not post message with "Enter" keyboard shortcut', async function (assert) {
    // Note that test doesn't assert Enter makes a newline, because this
    // default browser cannot be simulated with just dispatching
    // programmatically crafted events...
    assert.expect(2);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Chatter',
        { chatter },
    );
    assert.containsNone(
        document.body,
        '.o-Message',
        "should not have any message initially in chatter",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    await afterNextRender(
        () => {
            document.querySelector('.o-ComposerTextInput-textarea').focus();
            document.execCommand(
                'insertText',
                false,
                "Test",
            );
        },
    );
    const kevt = new window.KeyboardEvent(
        'keydown',
        { key: "Enter" },
    );
    document.querySelector('.o-ComposerTextInput-textarea').dispatchEvent(kevt);
    await nextAnimationFrame();
    assert.containsNone(
        document.body,
        '.o-Message',
        "should still not have any message in mailing channel after pressing 'Enter' in text input of composer",
    );
});

});
});
});
