/** @odoo-module alias=im_livechat.components.ThreadTextualTypingStatus.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('im_livechat', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ThreadTextualTypingStatus', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('receive visitor typing status "is typing"', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            anonymous_name: "Visitor 20",
            channel_type: 'livechat',
            id: 20,
            livechat_operator_id: this.data.currentPartnerId,
            members: [this.data.currentPartnerId, this.data.publicPartnerId],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/findById',
        {
            id: 20,
            model: 'mail.channel',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ThreadTextualTypingStatus',
        { thread },
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadTextualTypingStatus').textContent,
        "",
        "Should display no one is currently typing",
    );

    // simulate receive typing notification from livechat visitor "is typing"
    await afterNextRender(
        () => {
            const typingData = {
                info: 'typing_status',
                is_typing: true,
                partner_id: env.services.model.messaging.publicPartners()[0].id(),
                partner_name: env.services.model.messaging.publicPartners()[0].name(),
            };
            const notification = [[false, 'mail.channel', 20], typingData];
            this.widget.call('bus_service', 'trigger', 'notification', [notification]);
        },
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadTextualTypingStatus').textContent,
        "Visitor 20 is typing...",
        "Should display that visitor is typing",
    );
});

});
});
});
