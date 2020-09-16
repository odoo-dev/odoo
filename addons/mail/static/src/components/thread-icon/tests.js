/** @odoo-module alias=mail.components.ThreadIcon.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ThreadIcon', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('chat: correspondent is typing', async function (assert) {
    assert.expect(5);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 20,
            members: [this.data.currentPartnerId, 17],
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 17,
            im_status: 'online',
            name: "Demo",
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    await env.services.action.dispatch('Component/mount', 'ThreadIcon', { thread });
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon',
        "should have thread icon",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-online',
        "should have thread icon with partner im status icon 'online'",
    );

    // simulate receive typing notification from demo "is typing"
    await afterNextRender(
        () => {
            const typingData = {
                info: 'typing_status',
                is_typing: true,
                partner_id: 17,
                partner_name: "Demo",
            };
            const notification = [[false, 'mail.channel', 20], typingData];
            this.widget.call('bus_service', 'trigger', 'notification', [notification]);
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-typing',
        "should have thread icon with partner currently typing",
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadIcon-typing').title,
        "Demo is typing...",
        "title of icon should tell demo is currently typing",
    );

    // simulate receive typing notification from demo "no longer is typing"
    await afterNextRender(
        () => {
            const typingData = {
                info: 'typing_status',
                is_typing: false,
                partner_id: 17,
                partner_name: "Demo",
            };
            const notification = [[false, 'mail.channel', 20], typingData];
            this.widget.call('bus_service', 'trigger', 'notification', [notification]);
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-online',
        "should have thread icon with partner im status icon 'online' (no longer typing)",
    );
});

});
});
});
