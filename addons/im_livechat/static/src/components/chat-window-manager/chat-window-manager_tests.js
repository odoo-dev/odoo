/** @odoo-module alias=im_livechat.components.ChatWindowManager.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('im_livechat', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ChatWindowManager', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('closing a chat window with no message from admin side unpins it', async function (assert) {
    assert.expect(1);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'livechat',
            id: 10,
            is_pinned: true,
            members: [this.data.currentPartnerId, 10],
            uuid: 'channel-10-uuid',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 10,
            name: "Demo",
        },
    );
    this.data['res.users'].records.push(
        {
            id: 42,
            partner_id: 10,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'ChatWindowManager',
    );
    await env.services.action.dispatch(
        'Component/mount',
        'MessagingMenu',
    );
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    await afterNextRender(
        () => document.querySelector('.o-NotificationList-preview').click(),
    );
    await afterNextRender(
        () => document.querySelector('.o-ChatWindowHeader-commandClose').click(),
    );
    const channels = await env.services.rpc(
        {
            model: 'mail.channel',
            method: 'read',
            args: [10],
        },
        { shadow: true },
    );
    assert.strictEqual(
        channels[0].is_pinned,
        false,
        'Livechat channel should not be pinned',
    );
});

});
});
});
