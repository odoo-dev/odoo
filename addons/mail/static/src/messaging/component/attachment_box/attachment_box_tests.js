odoo.define('mail.messaging.component.AttachmentBoxTests', function (require) {
"use strict";

const components = {
    AttachmentBox: require('mail.messaging.component.AttachmentBox'),
};
const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    dragenterFiles,
    dropFiles,
    pause,
    start: utilsStart,
} = require('mail.messaging.testUtils');

const { file: { createFile } } = require('web.test_utils');

QUnit.module('mail', {}, function () {
QUnit.module('messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('AttachmentBox', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createAttachmentBoxComponent = async (thread, otherProps) => {
            const AttachmentBoxComponent = components.AttachmentBox;
            AttachmentBoxComponent.env = this.env;
            this.component = new AttachmentBoxComponent(null, Object.assign({
                threadLocalId: thread.localId,
            }, otherProps));
            await this.component.mount(this.widget.el);
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
        if (this.component) {
            this.component.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        delete components.AttachmentBox.env;
        this.env = undefined;
    },
});

QUnit.test('base empty rendering', async function (assert) {
    assert.expect(4);

    await this.start();
    const thread = this.env.entities.Thread.create({
        id: 100,
        model: 'res.partner',
    });
    await this.createAttachmentBoxComponent(thread);
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox`).length,
        1,
        "should have an attachment box"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox_buttonAdd`).length,
        1,
        "should have a button add"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_FileUploader_input`).length,
        1,
        "should have a file input"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox .o_Attachment`).length,
        0,
        "should not have any attachment"
    );
});

QUnit.test('base non-empty rendering', async function (assert) {
    assert.expect(6);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                assert.step('ir.attachment/search_read');
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
    const thread = this.env.entities.Thread.create({
        id: 100,
        model: 'res.partner',
    });
    await thread.fetchAttachments();
    await this.createAttachmentBoxComponent(thread);
    assert.verifySteps(
        ['ir.attachment/search_read'],
        "should have fetched attachments"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox`).length,
        1,
        "should have an attachment box"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox_buttonAdd`).length,
        1,
        "should have a button add"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_FileUploader_input`).length,
        1,
        "should have a file input"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_attachmentBox_attachmentList`).length,
        1,
        "should have an attachment list"
    );
});

QUnit.test('attachment box: drop attachments', async function (assert) {
    assert.expect(5);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [];
            }
            return this._super(...arguments);
        }
    });
    const thread = this.env.entities.Thread.create({
        id: 100,
        model: 'res.partner',
    });
    await thread.fetchAttachments();
    await this.createAttachmentBoxComponent(thread);
    const files = [
        await createFile({
            content: 'hello, world',
            contentType: 'text/plain',
            name: 'text.txt',
        }),
    ];
    assert.strictEqual(
        document.querySelectorAll('.o_AttachmentBox').length,
        1,
        "should have an attachment box"
    );

    dragenterFiles(document.querySelector('.o_AttachmentBox'));
    await afterNextRender();
    assert.ok(
        document.querySelector('.o_AttachmentBox_dropZone'),
        "should have a drop zone"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox .o_Attachment`).length,
        0,
        "should have no attachment before files are dropped"
    );

    dropFiles(
        document.querySelector('.o_AttachmentBox_dropZone'),
        files
    );
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox .o_Attachment`).length,
        1,
        "should have 1 attachment in the box after files dropped"
    );

    dragenterFiles(document.querySelector('.o_AttachmentBox'));
    await afterNextRender();
    dropFiles(
        document.querySelector('.o_AttachmentBox_dropZone'),
        [
            await createFile({
                content: 'hello, world',
                contentType: 'text/plain',
                name: 'text2.txt',
            }),
            await createFile({
                content: 'hello, world',
                contentType: 'text/plain',
                name: 'text3.txt',
            })
        ]
    );
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_AttachmentBox .o_Attachment`).length,
        3,
        "should have 3 attachments in the box after files dropped"
    );
});

});
});
});

});
