/** @odoo-module alias=mail.components.ThreadPreview.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ThreadPreview', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('mark as read', async function (assert) {
    assert.expect(8);
    this.data['mail.channel'].records.push(
        {
            id: 11,
            message_unread_counter: 1,
        },
    );
    this.data['mail.message'].records.push(
        {
            channel_ids: [11],
            id: 100,
            model: 'mail.channel',
            res_id: 11,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route.includes('channel_seen')) {
                assert.step('channel_seen');
            }
            return this._super(...arguments);
        },
    });
    await env.services.action.dispatch('Component/mount', 'ChatWindowManager');
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 11,
        $$$model: 'mail.channel',
    });
    await env.services.action.dispatch('Component/mount', 'ThreadPreview', { thread });
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-markAsRead',
        "should have the mark as read button",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-counter',
        "should have an unread counter",
    );

    await afterNextRender(
        () => document.querySelector('.o-ThreadPreview-markAsRead').click(),
    );
    assert.verifySteps(
        ['channel_seen'],
        "should have marked the thread as seen",
    );
    assert.hasClass(
        document.querySelector('.o-ThreadPreview'),
        'o-isMuted',
        "should be muted once marked as read",
    );
    assert.containsNone(
        document.body,
        '.o-ThreadPreview-markAsRead',
        "should no longer have the mark as read button",
    );
    assert.containsNone(
        document.body,
        '.o-ThreadPreview-counter',
        "should no longer have an unread counter",
    );
    assert.containsNone(
        document.body,
        '.o-ChatWindow',
        "should not have opened the thread",
    );
});

});
});
});
