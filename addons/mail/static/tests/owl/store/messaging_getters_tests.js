odoo.define('mail.store.GettersTests', function (require) {
'use strict';

const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.owl.testUtils');

QUnit.module('mail.owl', {}, function () {
QUnit.module('store', {}, function () {
QUnit.module('Getters', {
    beforeEach() {
        utilsBeforeEach(this);
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { env, widget } = await utilsStart(Object.assign({}, params,{
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        this.env = undefined;
        if (this.widget) {
            this.widget.destroy();
            this.widget = undefined;
        }
    }
});

QUnit.test('attachmentDisplayName', async function (assert) {
    assert.expect(3);

    await this.start();
    assert.notOk(this.env.store.state.attachments['ir.attachment_750']);

    const attachmentLocalId = this.env.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    const attachment = this.env.store.state.attachments[attachmentLocalId];
    assert.ok(attachment);
    assert.strictEqual(this.env.store.getters.attachmentDisplayName(attachment.localId), "test.txt");
});

QUnit.test('attachmentExtension', async function (assert) {
    assert.expect(3);

    await this.start();
    assert.notOk(this.env.store.state.attachments['ir.attachment_750']);

    const attachmentLocalId = this.env.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    const attachment = this.env.store.state.attachments[attachmentLocalId];
    assert.ok(attachment);
    assert.strictEqual(this.env.store.getters.attachmentExtension(attachment.localId), "txt");
});

QUnit.test('attachment: fileType', async function (assert) {
    assert.expect(3);

    await this.start();
    assert.notOk(this.env.store.state.attachments['ir.attachment_750']);

    const attachmentLocalId = this.env.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    const attachment = this.env.store.getters.getStoreObject({
        storeKey: 'attachments',
        localId: attachmentLocalId,
        computes: [{
            name: 'fileType',
        }],
    });
    assert.ok(attachment);
    assert.strictEqual(attachment.fileType, 'text');
});

QUnit.test('attachment: textFile', async function (assert) {
    assert.expect(3);

    await this.start();
    assert.notOk(this.env.store.state.attachments['ir.attachment_750']);

    const attachmentLocalId = this.env.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    const attachment = this.env.store.getters.getStoreObject({
        storeKey: 'attachments',
        localId: attachmentLocalId,
        computes: [{
            name: 'fileType', // TODO SEB necessary to compute isTextFile
        }, {
            name: 'isTextFile',
        }],
    });
    assert.ok(attachment);
    assert.ok(attachment.isTextFile);
});

QUnit.test('attachment: isViewable', async function (assert) {
    assert.expect(3);

    await this.start();
    assert.notOk(this.env.store.state.attachments['ir.attachment_750']);

    const attachmentLocalId = this.env.store.dispatch('createAttachment', {
        filename: "test.txt",
        id: 750,
        mimetype: 'text/plain',
        name: "test.txt",
    });
    const attachment = this.env.store.getters.getStoreObject({
        storeKey: 'attachments',
        localId: attachmentLocalId,
        computes: [{
            name: 'fileType', // TODO SEB necessary to compute isTextFile
        }, {
            name: 'isTextFile', // TODO SEB necessary for isViewable
        }, {
            name: 'isViewable',
        }],
    });
    assert.ok(attachment);
    assert.ok(attachment.isViewable);
});

});
});
});
