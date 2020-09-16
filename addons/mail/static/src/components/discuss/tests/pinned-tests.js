/** @odoo-module alias=mail.components.Discuss.pinnedTests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Discuss', {}, function () {
QUnit.module('pinnedTests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('sidebar: pinned channel 1: init with one pinned channel', async function (assert) {
    assert.expect(2);

    // channel that is expected to be found in the sidebar
    // with a random unique id that will be referenced in the test
    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'Discuss');
    assert.containsOnce(
        document.body,
        `.o-Discuss-thread[data-thread-local-id="${
            env.services.model.messaging.$$$inbox().localId
        }"]`,
        "The Inbox is opened in discuss",
    );
    assert.containsOnce(
        document.body,
        `.o-DiscussSidebarItem[data-thread-local-id="${
            env.services.action.dispatch('Thread/findById', {
                $$$id: 20,
                $$$model: 'mail.channel',
            }).localId
        }"]`,
        "should have the only channel of which user is member in discuss sidebar",
    );
});

QUnit.test('sidebar: pinned channel 2: open pinned channel', async function (assert) {
    assert.expect(1);

    // channel that is expected to be found in the sidebar
    // with a random unique id that will be referenced in the test
    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'Discuss');
    const threadGeneral = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    await afterNextRender(
        () => document.querySelector(`.o-DiscussSidebarItem[data-thread-local-id="${
            threadGeneral.localId
        }"]`).click(),
    );
    assert.containsOnce(
        document.body,
        `.o-Discuss-thread[data-thread-local-id="${threadGeneral.localId}"]`,
        "The channel #General is displayed in discuss",
    );
});

QUnit.test('sidebar: pinned channel 3: open pinned channel and unpin it', async function (assert) {
    assert.expect(8);

    // channel that is expected to be found in the sidebar
    // with a random unique id that will be referenced in the test
    this.data['mail.channel'].records.push(
        {
            id: 20,
            is_minimized: true,
            state: 'open',
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'execute_command') {
                assert.step('execute_command');
                assert.deepEqual(args.args[0], [20],
                    "The right id is sent to the server to remove",
                );
                assert.strictEqual(args.kwargs.command, 'leave',
                    "The right command is sent to the server",
                );
            }
            if (args.method === 'channel_fold') {
                assert.step('channel_fold');
            }
            return this._super(...arguments);
        },
    });
    await env.services.action.dispatch('Component/mount', 'Discuss');
    const threadGeneral = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    await afterNextRender(
        () => document.querySelector(`.o-DiscussSidebarItem[data-thread-local-id="${
            threadGeneral.localId
        }"]`).click(),
    );
    assert.verifySteps(
        [],
        "neither channel_fold nor execute_command are called yet",
    );

    await afterNextRender(
        () => document.querySelector('.o-DiscussSidebarItem-commandLeave').click(),
    );
    assert.verifySteps(
        [
            'channel_fold',
            'execute_command'
        ],
        "both channel_fold and execute_command have been called when unpinning a channel",
    );
    assert.containsNone(
        document.body,
        `.o-DiscussSidebarItem[data-thread-local-id="${threadGeneral.localId}"]`,
        "the channel must have been removed from discuss sidebar",
    );
    assert.containsOnce(
        document.body,
        '.o-Discuss-noThread',
        "should have no thread opened in discuss",
    );
});

QUnit.test('sidebar: unpin channel from bus', async function (assert) {
    assert.expect(5);

    // channel that is expected to be found in the sidebar
    // with a random unique id that will be referenced in the test
    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'Discuss');
    const threadGeneral = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    assert.containsOnce(
        document.body,
        `.o-Discuss-thread[data-thread-local-id="${env.services.model.messaging.$$$inbox().localId}"]`,
        "the Inbox is opened in discuss",
    );
    assert.containsOnce(
        document.body,
        `.o-DiscussSidebarItem[data-thread-local-id="${threadGeneral.localId}"]`,
        "1 channel is present in discuss sidebar and it is 'general'",
    );

    await afterNextRender(
        () => document.querySelector(`.o-DiscussSidebarItem[data-thread-local-id="${
            threadGeneral.localId
        }"]`).click(),
    );
    assert.containsOnce(
        document.body,
        `.o-Discuss-thread[data-thread-local-id="${threadGeneral.localId}"]`,
        "the channel #General is opened in discuss",
    );

    // Simulate receiving a leave channel notification
    // (e.g. from user interaction from another device or browser tab)
    await afterNextRender(
        () => {
            const notif = [
                ["dbName", 'res.partner', env.services.model.messaging.$$$currentPartner().$$$id()],
                {
                    channel_type: 'channel',
                    id: 20,
                    info: 'unsubscribe',
                    name: "General",
                    public: 'public',
                    state: 'open',
                }
            ];
            env.services.bus_service.trigger('notification', [notif]);
        },
    );
    assert.containsOnce(
        document.body,
        '.o-Discuss-noThread',
        "should have no thread opened in discuss",
    );
    assert.containsNone(
        document.body,
        `.o-DiscussSidebarItem[data-thread-local-id="${threadGeneral.localId}"]`,
        "the channel must have been removed from discuss sidebar",
    );
});

QUnit.test('[technical] sidebar: channel group_based_subscription: mandatorily pinned', async function (assert) {
    assert.expect(2);

    // FIXME: The following is admittedly odd.
    // Fixing it should entail a deeper reflexion on the group_based_subscription
    // and is_pinned functionalities, especially in python.
    // task-2284357

    // channel that is expected to be found in the sidebar
    this.data['mail.channel'].records.push(
        {
            group_based_subscription: true, // expected value for this test
            id: 20, // random unique id, will be referenced in the test
            is_pinned: false, // expected value for this test
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'Discuss');
    const threadGeneral = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    assert.containsOnce(
        document.body,
        `.o-DiscussSidebarItem[data-thread-local-id="${threadGeneral.localId}"]`,
        "the channel #General is in discuss sidebar",
    );
    assert.containsNone(
        document.body,
        'o-DiscussSidebarItem-commandLeave',
        "the group_based_subscription channel is not unpinnable",
    );
});

});
});
});
