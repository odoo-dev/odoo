/** @odoo-module alias=mail.components.FileUploader.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';

import { createFile, inputFiles } from 'web.test_utils_file';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('FileUploader', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
        this.components = [];
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('no conflicts between file uploaders', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const fileUploader1 = await env.services.action.dispatch('Component/mount', 'FileUploader');
    const fileUploader2 = await env.services.action.dispatch('Component/mount', 'FileUploader');
    const file1 = await createFile({
        content: "hello, world",
        contentType: 'text/plain',
        name: "text1.txt",
    });
    inputFiles(
        fileUploader1.el.querySelector('.o-FileUploader-input'),
        [file1],
    );
    await nextAnimationFrame(); // we can't use afterNextRender as fileInput are display:none
    assert.strictEqual(
        env.services.action.dispatch('Attachment/all').length,
        1,
        "Uploaded file should be the only attachment created",
    );

    const file2 = await createFile({
        content: "hello, world",
        contentType: 'text/plain',
        name: "text2.txt",
    });
    inputFiles(
        fileUploader2.el.querySelector('.o-FileUploader-input'),
        [file2],
    );
    await nextAnimationFrame();
    assert.strictEqual(
        env.services.action.dispatch('Attachment/all').length,
        2,
        "Uploaded file should be the only attachment added",
    );
});

});
});
});
