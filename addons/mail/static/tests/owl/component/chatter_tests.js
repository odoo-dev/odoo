odoo.define('mail.component.ChatterTests', function (require) {
'use strict';

const Chatter = require('mail.component.Chatter');
const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.messagingTestUtils');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('Chatter', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createChatterComponent = async ({ chatterLocalId }, otherProps) => {
            Chatter.env = this.env;
            this.chatter = new Chatter(null, Object.assign({ chatterLocalId }, otherProps));
            await this.chatter.mount(this.widget.el);
            await afterNextRender();
        };
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { env, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.chatter) {
            this.chatter.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        delete Chatter.env;
        this.env = undefined;
    }
});

QUnit.test('base rendering when chatter has no attachment', async function (assert) {
    assert.expect(6);
    let amountOfCalls = 0;
    let lastId = 1000;
    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [];
            }
            if (args.method === 'message_fetch') {
                // multiple calls here to be able to test load more (up to (10000/30) calls)
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
    const chatterLocalId = this.env.store.dispatch('createChatter', {
        initialThreadId: 100,
        initialThreadModel: 'res.partner',
    });
    await this.createChatterComponent({ chatterLocalId });
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "should have a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "should have a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
        0,
        "should not have an attachment box in the chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_thread`).length,
        1,
        "should have a thread in the chatter"
    );
    assert.strictEqual(
        document.querySelector(`.o_Chatter_thread`).dataset.threadLocalId,
        'res.partner_100',
        'thread should have the right thread local id'
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Message`).length,
        30,
        "the first 30 messages of thread should be loaded"
    );
});

QUnit.test('base rendering when chatter has no record', async function (assert) {
    assert.expect(7);
    await this.start({});
    const chatterLocalId = this.env.store.dispatch('createChatter', {
        initialThreadModel: 'res.partner'
    });
    await this.createChatterComponent({ chatterLocalId });
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "should have a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "should have a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
        0,
        "should not have an attachment box in the chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_thread`).length,
        1,
        "should have a thread in the chatter"
    );
    const chatter = this.env.store.state.chatters[chatterLocalId];
    assert.ok(
        this.env.store.state.threads[chatter.threadLocalId].isTemporary,
        "thread should have a temporary thread local id"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Message`).length,
        1,
        "should have a message"
    );
    assert.strictEqual(
        document.querySelector(`.o_Message_content`).textContent,
        "Creating a new record...",
        "should have the 'Creating a new record ...' message"
    );
});

QUnit.test('base rendering when chatter has attachments', async function (assert) {
    assert.expect(3);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [{
                    id: 143,
                    filename: 'Blah.txt',
                    mimetype: 'text/plain',
                    name: 'Blah.txt'
                }, {
                    id: 144,
                    filename: 'Blu.txt',
                    mimetype: 'text/plain',
                    name: 'Blu.txt'
                }];
            }
            return this._super(...arguments);
        }
    });
    const chatterLocalId = this.env.store.dispatch('createChatter', {
        initialThreadId: 100,
        initialThreadModel: 'res.partner'
    });
    await this.createChatterComponent({ chatterLocalId });
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "should have a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "should have a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
        0,
        "should not have an attachment box in the chatter"
    );
});

QUnit.test('show attachment box', async function (assert) {
    assert.expect(6);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [{
                    id: 143,
                    filename: 'Blah.txt',
                    mimetype: 'text/plain',
                    name: 'Blah.txt'
                }, {
                    id: 144,
                    filename: 'Blu.txt',
                    mimetype: 'text/plain',
                    name: 'Blu.txt'
                }];
            }
            return this._super(...arguments);
        }
    });
    const chatterLocalId = this.env.store.dispatch('createChatter', {
        initialThreadId: 100,
        initialThreadModel: 'res.partner',
    });
    await this.createChatterComponent({ chatterLocalId });
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "should have a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "should have a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachments`).length,
        1,
        "should have an attachments button in chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachmentsCount`).length,
        1,
        "attachments button should have a counter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
        0,
        "should not have an attachment box in the chatter"
    );

    document.querySelector(`.o_ChatterTopbar_buttonAttachments`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_attachmentBox`).length,
        1,
        "should have an attachment box in the chatter"
    );
});

QUnit.test('composer show/hide on log note/send message', async function (assert) {
    assert.expect(8);

    await this.start();
    const chatterLocalId = this.env.store.dispatch('createChatter', {
        initialThreadId: 100,
        initialThreadModel: 'res.partner',
    });
    await this.createChatterComponent({ chatterLocalId });
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonSendMessage`).length,
        1,
        "should have a send message button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonLogNote`).length,
        1,
        "should have a log note button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_composer`).length,
        0,
        "should not have a composer"
    );

    document.querySelector(`.o_ChatterTopbar_buttonSendMessage`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_composer`).length,
        1,
        "should have a composer"
    );

    document.querySelector(`.o_ChatterTopbar_buttonLogNote`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_composer`).length,
        1,
        "should still have a composer"
    );

    document.querySelector(`.o_ChatterTopbar_buttonLogNote`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_composer`).length,
        0,
        "should have no composer anymore"
    );

    document.querySelector(`.o_ChatterTopbar_buttonSendMessage`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_composer`).length,
        1,
        "should have a composer"
    );

    document.querySelector(`.o_ChatterTopbar_buttonSendMessage`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_composer`).length,
        0,
        "should have no composer anymore"
    );
});

});
});
});
