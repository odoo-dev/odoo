/** @odoo-module alias=im_livechat.components.MessagingMenu.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('im_livechat', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('MessagingMenu', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('livechats should be in "chat" filter', async function (assert) {
    assert.expect(7);

    this.data['mail.channel'].records.push(
        {
            anonymous_name: "Visitor 11",
            channel_type: 'livechat',
            id: 11,
            livechat_operator_id: this.data.currentPartnerId,
            members: [this.data.currentPartnerId, this.data.publicPartnerId],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'MessagingMenu',
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu',
        "should have messaging menu",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="all"]',
        "should have a tab/filter 'all' in messaging menu",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu_tabButton[data-tab-id="chat"]',
        "should have a tab/filter 'chat' in messaging menu",
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]'),
        'o-isActive',
        "tab/filter 'all' of messaging menu should be active initially",
    );
    assert.containsOnce(
        document.body,
        `.o-ThreadPreview[data-thread-local-id="${
            env.services.action.dispatch(
                'Thread/findById',
                {
                    id: 11,
                    model: 'mail.channel',
                },
            ).localId
        }"]`,
        "livechat should be listed in 'all' tab/filter of messaging menu",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]').click(),
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]'),
        'o-isActive',
        "tab/filter 'chat' of messaging menu should become active after click",
    );
    assert.containsOnce(
        document.body,
        `.o-ThreadPreview[data-thread-local-id="${
            env.services.action.dispatch(
                'Thread/findById',
                {
                    id: 11,
                    model: 'mail.channel',
                },
            ).localId
        }"]`,
        "livechat should be listed in 'chat' tab/filter of messaging menu",
    );
});

});
});
});
