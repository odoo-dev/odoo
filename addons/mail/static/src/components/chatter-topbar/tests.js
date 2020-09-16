/** @odoo-module alias=mail.components.ChatterTopbar.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import { makeTestPromise } from 'web.test_utils';
import { click } from 'web.test_utils_dom';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ChatterTopbar', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('base rendering', async function (assert) {
    assert.expect(8);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage',
        "should have a send message button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "should have a log note button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonScheduleActivity',
        "should have a schedule activity button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should not have a loader",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should have a counter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-followerListMenu',
        "should have a follower menu",
    );
});

QUnit.test('base disabled rendering', async function (assert) {
    assert.expect(8);

    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        { threadModel: 'res.partner' },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage').disabled,
        "send message button should be disabled",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonLogNote').disabled,
        "log note button should be disabled",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonScheduleActivity').disabled,
        "schedule activity should be disabled",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonAttachments').disabled,
        "attachments button should be disabled",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should not have a loader",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should have a counter",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterTopbar-buttonAttachmentsCount').textContent,
        '0',
        "attachments button counter should be 0",
    );
});

QUnit.test('attachment loading is delayed', async function (assert) {
    assert.expect(4);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv({
        loadingBaseDelayDuration: 100,
        async mockRPC(route) {
            if (route.includes('ir.attachment/search_read')) {
                await makeTestPromise(); // simulate long loading
            }
            return this._super(...arguments);
        },
        usingTimeControl: true,
    });
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should not have a loader yet",
    );

    await afterNextRender(
        () => env.services.action.dispatch(
            'Time/advance',
            100,
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should now have a loader",
    );
});

QUnit.test('attachment counter while loading attachments', async function (assert) {
    assert.expect(4);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route) {
            if (route.includes('ir.attachment/search_read')) {
                await makeTestPromise(); // simulate long loading
            }
            return this._super(...arguments);
        }
    });
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should have a loader",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should not have a counter",
    );
});

QUnit.test('attachment counter transition when attachments become loaded)', async function (assert) {
    assert.expect(7);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const attachmentPromise = makeTestPromise();
    const env = await createEnv({
        async mockRPC(route) {
            const _super = this._super.bind(this, ...arguments); // limitation of class.js
            if (route.includes('ir.attachment/search_read')) {
                await attachmentPromise;
            }
            return _super();
        },
    });
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should have a loader",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should not have a counter",
    );

    await afterNextRender(
        () => attachmentPromise.resolve(),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCountLoader',
        "attachments button should not have a loader",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should have a counter",
    );
});

QUnit.test('attachment counter without attachments', async function (assert) {
    assert.expect(4);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should have a counter",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterTopbar-buttonAttachmentsCount').textContent,
        '0',
        'attachment counter should contain "0"',
    );
});

QUnit.test('attachment counter with attachments', async function (assert) {
    assert.expect(4);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachmentsCount',
        "attachments button should have a counter",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterTopbar-buttonAttachmentsCount').textContent,
        '2',
        'attachment counter should contain "2"',
    );
});

QUnit.test('composer state conserved when clicking on another topbar button', async function (assert) {
    assert.expect(8);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "should have a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage',
        "should have a send message button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "should have a log note button in chatter menu",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "should have an attachments button in chatter menu",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonLogNote'),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote.o-isActive',
        "log button should now be active",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage.o-isActive',
        "send message button should not be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonAttachments'),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote.o-isActive',
        "log button should still be active",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage.o-isActive',
        "send message button should still be not active",
    );
});

QUnit.test('rendering with multiple partner followers', async function (assert) {
    assert.expect(7);

    this.data['mail.followers'].records.push(
        {
            // simulate real return from RPC
            // (the presence of the key and the falsy value need to be handled correctly)
            channel_id: false,
            id: 1,
            name: "Jean Michang",
            partner_id: 12,
            res_id: 100,
            res_model: 'res.partner',
        }, {
            // simulate real return from RPC
            // (the presence of the key and the falsy value need to be handled correctly)
            channel_id: false,
            id: 2,
            name: "Eden Hazard",
            partner_id: 11,
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 100,
            message_follower_ids: [1, 2],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            followerIds: [1, 2],
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "should have followers menu component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-buttonFollowers',
        "should have followers button",
    );

    await afterNextRender(
        () => click('.o-FollowerListMenu-buttonFollowers'),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be opened",
    );
    assert.containsN(
        document.body,
        '.o-Follower',
        2,
        "exactly two followers should be listed",
    );
    assert.containsN(
        document.body,
        '.o-Follower-name',
        2,
        "exactly two follower names should be listed",
    );
    assert.strictEqual(
        document.querySelectorAll('.o-Follower-name')[0].textContent.trim(),
        "Jean Michang",
        "first follower is 'Jean Michang'",
    );
    assert.strictEqual(
        document.querySelectorAll('.o-Follower-name')[1].textContent.trim(),
        "Eden Hazard",
        "second follower is 'Eden Hazard'",
    );
});

QUnit.test('rendering with multiple channel followers', async function (assert) {
    assert.expect(7);

    this.data['mail.followers'].records.push(
        {
            channel_id: 11,
            id: 1,
            name: "channel numero 5",
            // simulate real return from RPC
            // (the presence of the key and the falsy value need to be handled correctly)
            partner_id: false,
            res_id: 100,
            res_model: 'res.partner',
        }, {
            channel_id: 12,
            id: 2,
            name: "channel armstrong",
            // simulate real return from RPC
            // (the presence of the key and the falsy value need to be handled correctly)
            partner_id: false,
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 100,
            message_follower_ids: [1, 2],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const chatter = env.services.action.dispatch(
        'Chatter/create',
        {
            followerIds: [1, 2],
            threadId: 100,
            threadModel: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "should have followers menu component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-buttonFollowers',
        "should have followers button",
    );

    await afterNextRender(
        () => click('.o-FollowerListMenu-buttonFollowers'),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be opened",
    );
    assert.containsN(
        document.body,
        '.o-Follower',
        2,
        "exactly two followers should be listed",
    );
    assert.containsN(
        document.body,
        '.o-Follower-name',
        2,
        "exactly two follower names should be listed",
    );
    assert.strictEqual(
        document.querySelectorAll('.o-Follower-name')[0].textContent.trim(),
        "channel numero 5",
        "first follower is 'channel numero 5'",
    );
    assert.strictEqual(
        document.querySelectorAll('.o-Follower-name')[1].textContent.trim(),
        "channel armstrong",
        "second follower is 'channel armstrong'",
    );
});

QUnit.test('log note/send message switching', async function (assert) {
    assert.expect(8);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage',
        "should have a 'Send Message' button",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage'),
        'o-isActive',
        "'Send Message' button should not be active",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "should have a 'Log Note' button",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonLogNote'),
        'o-isActive',
        "'Log Note' button should not be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    assert.hasClass(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage'),
        'o-isActive',
        "'Send Message' button should be active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonLogNote'),
        'o-isActive',
        "'Log Note' button should not be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonLogNote'),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage'),
        'o-isActive',
        "'Send Message' button should not be active",
    );
    assert.hasClass(
        document.querySelector('.o-ChatterTopbar-buttonLogNote'),
        'o-isActive',
        "'Log Note' button should be active",
    );
});

QUnit.test('log note toggling', async function (assert) {
    assert.expect(4);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "should have a 'Log Note' button",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonLogNote'),
        'o-isActive',
        "'Log Note' button should not be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonLogNote'),
    );
    assert.hasClass(
        document.querySelector('.o-ChatterTopbar-buttonLogNote'),
        'o-isActive',
        "'Log Note' button should be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonLogNote'),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonLogNote'),
        'o-isActive',
        "'Log Note' button should not be active",
    );
});

QUnit.test('send message toggling', async function (assert) {
    assert.expect(4);

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
        'ChatterTopbar',
        { chatter },
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage',
        "should have a 'Send Message' button",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage'),
        'o-isActive',
        "'Send Message' button should not be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    assert.hasClass(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage'),
        'o-isActive',
        "'Send Message' button should be active",
    );

    await afterNextRender(
        () => click('.o-ChatterTopbar-buttonSendMessage'),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage'),
        'o-isActive',
        "'Send Message' button should not be active",
    );
});

});
});
});
