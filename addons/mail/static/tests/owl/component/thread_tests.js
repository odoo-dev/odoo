odoo.define('mail.component.ThreadTests', function (require) {
"use strict";

const Thread = require('mail.component.Thread');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    dragoverFiles,
    pause,
    start: utilsStart,
} = require('mail.owl.testUtils');

const testUtils = require('web.test_utils');

async function scroll({ scrollableElement, scrollTop }) {
    const scrollProm = testUtils.makeTestPromise();
    scrollableElement.addEventListener(
        'scroll',
        () => scrollProm.resolve(),
        false,
        { once: true });
    scrollableElement.scrollTop = scrollTop;
    await scrollProm; // scroll time
    await testUtils.nextTick(); // re-render
}

QUnit.module('mail.owl', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('Thread', {
    beforeEach() {
        utilsBeforeEach(this);

        /**
         * @param {string} threadLocalId
         * @param {Object} [otherProps]
         */
        this.createThread = async (threadLocalId, otherProps) => {
            const env = await this.widget.call('env', 'get');
            this.thread = new Thread(env, {
                threadLocalId,
                ...otherProps,
            });
            // needed to allow scrolling
            await this.thread.mount(this.widget.el);
            this.thread.el.style.height = '300px';
            await testUtils.nextTick();
        };

        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { store, widget } = await utilsStart({
                ...params,
                data: this.data,
            });
            this.store = store;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.thread) {
            this.thread.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.store = undefined;
    }
});

QUnit.test('dragover files on thread with composer', async function (assert) {
    assert.expect(1);

    await this.start();
    const threadLocalId = this.store.dispatch('_createThread', {
        channel_type: 'channel',
        id: 100,
        members: [
            {
                email: "john@example.com",
                id: 9,
                name: "John",
            },
            {
                email: "fred@example.com",
                id: 10,
                name: "Fred",
            }
        ],
        name: "General",
        public: 'public',
    });
    await this.createThread(threadLocalId, {
        hasComposer: true,
    });
    await dragoverFiles(document.querySelector('.o_Thread'));
    assert.ok(
        document.querySelector('.o_Composer_dropZone'),
        "should have dropzone when dragging file over the thread");
});

QUnit.test('message list desc order', async function (assert) {
    assert.expect(8);
    let lastId = 10000;
    let amountOfCalls = 0;
    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'message_fetch') {
                amountOfCalls ++;
                assert.step(`message_fetch_${amountOfCalls}`);
                // Just return 30 different messages
                const messagesData = [...Array(30).keys()].reduce(function (acc, i) {
                    acc.push({
                        author_id: [i + 1, `Author #${i}`],
                        body: `<p>The message</p>`,
                        channel_ids: [20],
                        date: "2019-04-20 10:00:00",
                        id: lastId - i,
                        message_type: 'comment',
                        model: 'mail.channel',
                        record_name: 'General',
                        res_id: 20,
                    });
                    return acc;
                }, []);
                lastId -= 30;
                return messagesData;
            }
            return this._super(...arguments);
        }
    });
    const threadLocalId = this.store.dispatch('_createThread', {
        channel_type: 'channel',
        id: 100,
        members: [
            {
                email: "john@example.com",
                id: 9,
                name: "John",
            },
            {
                email: "fred@example.com",
                id: 10,
                name: "Fred",
            }
        ],
        name: "General",
        public: 'public',
    });
    await this.createThread(threadLocalId, {
        order: 'desc'
    });
    await testUtils.nextTick();
    const messageItems = document.querySelectorAll(`
        .o_MessageList
        .o_MessageList_item
    `);
    assert.notOk(
        messageItems[0].classList.contains("o_MessageList_loadMore"),
        "load more link should NOT be before messages");
    assert.ok(
        messageItems[messageItems.length - 1].classList.contains("o_MessageList_loadMore"),
        "load more link should be after messages");
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message`)
            .length,
        30,
        "should have 30 messages at the beginning"
    );
    // scroll to bottom
    await scroll({
        scrollableElement: document.querySelector(`.o_Thread_messageList`),
        scrollTop: document.querySelector(`.o_Thread_messageList`).scrollHeight
    });

    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message`)
            .length,
        60,
        "should have 60 messages after scrolled to bottom"
    );

    // scroll to top
    await scroll({
        scrollableElement: document.querySelector(`.o_Thread_messageList`),
        scrollTop: 0
    });
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message`)
            .length,
        60,
        "scrolling to top should not trigger any message fetching"
    );
    assert.verifySteps(['message_fetch_1', 'message_fetch_2']);
});

QUnit.test('message list asc order', async function (assert) {
    assert.expect(8);
    let lastId = 10000;
    let amountOfCalls = 0;
    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'message_fetch') {
                amountOfCalls ++;
                assert.step(`message_fetch_${amountOfCalls}`);
                // Just return 30 different messages
                const messagesData = [...Array(30).keys()].reduce(function (acc, i) {
                    acc.push({
                        author_id: [i + 1, `Author #${i}`],
                        body: `<p>The message</p>`,
                        channel_ids: [20],
                        date: "2019-04-20 10:00:00",
                        id: lastId - i,
                        message_type: 'comment',
                        model: 'mail.channel',
                        record_name: 'General',
                        res_id: 20,
                    });
                    return acc;
                }, []);
                lastId -= 30;
                return messagesData;
            }
            return this._super(...arguments);
        }
    });
    const threadLocalId = this.store.dispatch('_createThread', {
        channel_type: 'channel',
        id: 100,
        members: [
            {
                email: "john@example.com",
                id: 9,
                name: "John",
            },
            {
                email: "fred@example.com",
                id: 10,
                name: "Fred",
            }
        ],
        name: "General",
        public: 'public',
    });
    await this.createThread(threadLocalId, {
        order: 'asc'
    });
    await testUtils.nextTick();
    const messageItems = document.querySelectorAll(`
        .o_MessageList
        .o_MessageList_item
    `);
    assert.notOk(
        messageItems[messageItems.length - 1].classList.contains("o_MessageList_loadMore"),
        "load more link should be before messages");
    assert.ok(
        messageItems[0].classList.contains("o_MessageList_loadMore"),
        "load more link should NOT be after messages");
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message`)
            .length,
        30,
        "should have 30 messages at the beginning"
    );

    // scroll to top
    await scroll({
        scrollableElement: document.querySelector(`.o_Thread_messageList`),
        scrollTop: 0
    });
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message`)
            .length,
        60,
        "should have 60 messages after scrolled to bottom"
    );

    // scroll to bottom
    await scroll({
        scrollableElement: document.querySelector(`.o_Thread_messageList`),
        scrollTop: document.querySelector(`.o_Thread_messageList`).scrollHeight
    });
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message`)
            .length,
        60,
        "scrolling to bottom should not trigger any message fetching"
    );
    assert.verifySteps(['message_fetch_1', 'message_fetch_2']);
});

});
});
});
