/** @odoo-module alias=im_livechat.components.ThreadIcon.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('im_livechat', {}, function () {
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

QUnit.test('livechat: public website visitor is typing', async function (assert) {
    assert.expect(4);

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
        'ThreadIcon',
        { thread },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon',
        "should have thread icon",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon .fa.fa-comments',
        "should have default livechat icon",
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
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-typing',
        "should have thread icon with visitor currently typing",
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadIcon-typing').title,
        "Visitor 20 is typing...",
        "title of icon should tell visitor is currently typing",
    );
});

});
});
});
