odoo.define('mail.component.FileUploaderTests', function (require) {
"use strict";

const FileUploader = require('mail.component.FileUploader');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    inputFiles,
    nextAnimationFrame,
    pause,
    start: utilsStart,
} = require('mail.messagingTestUtils');

const { file: { createFile } } = require('web.test_utils');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('FileUploader', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createFileUploaderComponent = async (props) => {
            FileUploader.env = this.env;
            const fileUploader = new FileUploader(
                null,
                Object.assign({ attachmentLocalIds: [] }, props)
            );
            await fileUploader.mount(this.widget.el);
            return fileUploader;
        };
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            const { env, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
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
        delete FileUploader.env;
        this.env = undefined;
    }
});

QUnit.test('no conflicts between file uploaders', async function (assert) {
    assert.expect(2);

    await this.start();
    const fileUploader1 = await this.createFileUploaderComponent();
    const fileUploader2 = await this.createFileUploaderComponent();
    const file1 = await createFile({
        name: 'text1.txt',
        content: 'hello, world',
        contentType: 'text/plain',
    });
    inputFiles(
        fileUploader1.el.querySelector('.o_FileUploader_input'),
        [file1]
    );
    await nextAnimationFrame(); // we can't use afterNextRender as fileInput are display:none
    assert.strictEqual(
        Object.keys(this.env.store.state.attachments).length,
        1,
        'Uploaded file should be the only attachment created'
    );

    const file2 = await createFile({
        name: 'text2.txt',
        content: 'hello, world',
        contentType: 'text/plain',
    });
    inputFiles(
        fileUploader2.el.querySelector('.o_FileUploader_input'),
        [file2]
    );
    await nextAnimationFrame();
    assert.strictEqual(
        Object.keys(this.env.store.state.attachments).length,
        2,
        'Uploaded file should be the only attachment added'
    );
});

});
});
});
