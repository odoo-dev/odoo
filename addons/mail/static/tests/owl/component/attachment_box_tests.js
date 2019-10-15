odoo.define('mail.component.AttachmentBoxTests', function (require) {
"use strict";

const AttachmentBox = require('mail.component.AttachmentBox');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    pause,
    start: startUtils,
} = require('mail.owl.testUtils');

const testUtils = require('web.test_utils');

QUnit.module('mail.owl', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('AttachmentBox', {
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
        this.createAttachmentBox = async (threadLocalId, otherProps) => {
            const env = await this.widget.call('env', 'get');
            this.attachmentBox = new AttachmentBox(env, {
                threadLocalId,
                ...otherProps
            });
            await this.attachmentBox.mount(this.widget.$el[0]);
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
        if (this.attachmentBox) {
            this.attachmentBox.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.store = undefined;
    }
});

QUnit.test('base empty rendering', async function (assert) {
    assert.expect(4);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [];
            }
            return this._super(...arguments);
        }
    });
    // attachmentBox needs an existing thread to work
    await this.createThread({_model: 'res.partner', id: 100});
    await this.createAttachmentBox('res.partner_100');
    await testUtils.nextTick();

    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox`)
            .length,
        1,
        "should have an attachment box");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox
                .o_AttachmentBox_buttonAdd
                `)
            .length,
        1,
        "should have a button add");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox
                .o_AttachmentBox_fileInput
                `)
            .length,
        1,
        "should have a file input");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox
                .o_attachmentBox_attachmentList
                `)
            .length,
        0,
        "should not have an attachment list");
});

QUnit.test('base non-empty rendering', async function (assert) {
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
    // attachmentBox needs an existing thread to work
    await this.createThread({_model: 'res.partner', id: 100}, true);
    await this.createAttachmentBox('res.partner_100');
    await testUtils.nextTick();

    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox`)
            .length,
        1,
        "should have an attachment box");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox
                .o_AttachmentBox_buttonAdd
                `)
            .length,
        1,
        "should have a button add");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox
                .o_AttachmentBox_fileInput
                `)
            .length,
        1,
        "should have a file input");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_AttachmentBox
                .o_attachmentBox_attachmentList
                `)
            .length,
        1,
        "should have an attachment list");
});

});
});
});
