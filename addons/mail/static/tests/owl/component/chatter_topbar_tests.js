odoo.define('mail.component.ChatterTopBarTests', function (require) {
"use strict";

const ChatterTopBar = require('mail.component.ChatterTopbar');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    pause,
    start: startUtils,
} = require('mail.owl.testUtils');

const testUtils = require('web.test_utils');

QUnit.module('mail.owl', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('ChatterTopbar', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createThread = async ({_model, id}, fetchAttachments = false) => {
            const env = await this.widget.call('env', 'get');
            const threadLocalId = await env.store.dispatch('_createThread', { _model, id });
            if (fetchAttachments) {
                await env.store.dispatch('fetchThreadAttachments', {
                    resId: id,
                    resModel: _model,
                    threadLocalId
                });
            }
            return threadLocalId;
        };
        this.createChatterTopbar = async (threadLocalId, otherProps) => {
            const env = await this.widget.call('env', 'get');
            this.chatter_topbar = new ChatterTopBar(env, {
                threadLocalId,
                ...otherProps
            });
            await this.chatter_topbar.mount(this.widget.$el[0]);
        };
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { store, widget } = await startUtils({
                ...params,
                data: this.data,
            });
            this.store = store;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.chatter_topbar) {
            this.chatter_topbar.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.store = undefined;
    }
});

QUnit.test('base rendering', async function (assert) {
    assert.expect(9);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [];
            }
            return this._super(...arguments);
        }
    });
    await this.createThread({_model: 'res.partner', id: 100});
    await this.createChatterTopbar('res.partner_100');
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar`)
            .length,
        1,
        "should have a chatter topbar");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonSendMessage
                `)
            .length,
        1,
        "should have a send message button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonLogNote
                `)
            .length,
        1,
        "should have a log note button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonScheduleActivity
                `)
            .length,
        1,
        "should have a schedule activity button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                `)
            .length,
        1,
        "should have an attachments button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                .o_ChatterTopbar_buttonAttachments_count
                `)
            .length,
        1,
        "attachments button should have a counter");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonFollow
                `)
            .length,
        1,
        "should have a follow button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonFollowers
                `)
            .length,
        1,
        "should have a followers button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonFollowers
                .o_ChatterTopbar_buttonFollowers_count
                `)
            .length,
        1,
        "followers button should have a counter");
});

QUnit.test('attachment count without attachments', async function (assert) {
    assert.expect(4);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [];
            }
            return this._super(...arguments);
        }
    });
    await this.createThread({_model: 'res.partner', id: 100});
    await this.createChatterTopbar('res.partner_100');
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar`)
            .length,
        1,
        "should have a chatter topbar");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                `)
            .length,
        1,
        "should have an attachments button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                .o_ChatterTopbar_buttonAttachments_count
                `)
            .length,
        1,
        "attachments button should have a counter");
    assert.strictEqual(
        document
            .querySelector(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                .o_ChatterTopbar_buttonAttachments_count
                `)
            .textContent,
        '0',
        'attachment counter should contain "0"'
        );
});

QUnit.test('attachment count with attachments', async function (assert) {
    assert.expect(4);

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
    await this.createThread({_model: 'res.partner', id: 100}, true);
    await this.createChatterTopbar('res.partner_100');
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar`)
            .length,
        1,
        "should have a chatter topbar");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                `)
            .length,
        1,
        "should have an attachments button in chatter menu");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                .o_ChatterTopbar_buttonAttachments_count
                `)
            .length,
        1,
        "attachments button should have a counter");
    assert.strictEqual(
        document
            .querySelector(`
                .o_ChatterTopbar
                .o_ChatterTopbar_buttonAttachments
                .o_ChatterTopbar_buttonAttachments_count
                `)
            .textContent,
        '2',
        'attachment counter should contain "2"'
        );
});

});
});
});
