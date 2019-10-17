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
            await this.thread.mount(this.widget.$el[0]);
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

QUnit.only('message list desc order', async function (assert) {
    assert.expect(5);
    let amountOfCalls = 0;
    let lastId = 10000;
    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'message_fetch') {
                if (amountOfCalls > 4) {
                    return [];
                }
                // multiple calls here to be able to test load more (up to (10000 / 30) calls normally
                let messagesData = [];
                const amountOfMessages = 30;
                const firstIValue = (lastId - amountOfCalls * amountOfMessages) - 1;
                const lastIValue = firstIValue - amountOfMessages;

                for (let i = firstIValue; i > lastIValue; i--) {
                    messagesData.push({
                        author_id: [firstIValue, `#${firstIValue}`],
                        body: `<em>Page ${amountOfCalls + 1}</em><br/><p>#${i} message</p>`,
                        channel_ids: [20],
                        date: "2019-04-20 10:00:00",
                        id: lastId + i,
                        message_type: 'comment',
                        model: 'mail.channel',
                        record_name: 'General',
                        res_id: 20,
                    });
                }
                lastId = lastIValue;
                amountOfCalls++;
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
    // needed to allow scrolling
    this.thread.el.style.height = '300px';
    await testUtils.nextTick();
    assert.strictEqual(
        document
            .querySelectorAll(`.o_MessageList_loadMore + .o_Message`)
            .length,
        0,
        "load more link should NOT be before messages");
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message + .o_MessageList_loadMore`)
            .length,
        1,
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
});

QUnit.only('message list asc order', async function (assert) {
    assert.expect(5);
    let amountOfCalls = 0;
    let lastId = 10000;
    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'message_fetch') {
                if (amountOfCalls > 4) {
                    return [];
                }
                // multiple calls here to be able to test load more (up to (10000 / 30) calls normally
                let messagesData = [];
                const amountOfMessages = 30;
                const firstIValue = (lastId - amountOfCalls * amountOfMessages) - 1;
                const lastIValue = firstIValue - amountOfMessages;

                for (let i = firstIValue; i > lastIValue; i--) {
                    messagesData.push({
                        author_id: [firstIValue, `#${firstIValue}`],
                        body: `<em>Page ${amountOfCalls + 1}</em><br/><p>#${i} message</p>`,
                        channel_ids: [20],
                        date: "2019-04-20 10:00:00",
                        id: lastId + i,
                        message_type: 'comment',
                        model: 'mail.channel',
                        record_name: 'General',
                        res_id: 20,
                    });
                }
                lastId = lastIValue;
                amountOfCalls++;
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
    // needed to allow scrolling
    this.thread.el.style.height = '300px';
    await testUtils.nextTick();
    assert.strictEqual(
        document
            .querySelectorAll(`.o_MessageList_loadMore + .o_Message`)
            .length,
        1,
        "load more link should be before messages");
    assert.strictEqual(
        document
            .querySelectorAll(`.o_Message + .o_MessageList_loadMore`)
            .length,
        0,
        "load more link should NOT be after messages");
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
        30,
        "scrolling to bottom should not trigger any message fetching"
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
});

});
});
});
