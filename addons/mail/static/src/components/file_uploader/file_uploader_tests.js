odoo.define('mail/static/src/components/file_uploader/file_uploader_tests.js', function (require) {
"use strict";

const components = {
    FileUploader: require('mail/static/src/components/file_uploader/file_uploader.js'),
};
const {
    afterEach,
    beforeEach,
    createRootComponent,
    nextAnimationFrame,
    start,
} = require('mail/static/src/utils/test_utils.js');

const {
    file: {
        createFile,
        inputFiles,
    },
} = require('web.test_utils');
const utils = require('web.utils');

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('file_uploader', {}, function () {
QUnit.module('file_uploader_tests.js', {
    beforeEach() {
        beforeEach(this);
        this.components = [];

        this.createFileUploaderComponent = async otherProps => {
            const props = Object.assign({ attachmentLocalIds: [] }, otherProps);
            return createRootComponent(this, components.FileUploader, {
                props,
                target: this.widget.el,
            });
        };

        this.start = async params => {
            const { env, widget } = await start(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        afterEach(this);
    },
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
        this.env.models['mail.attachment'].all().length,
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
        this.env.models['mail.attachment'].all().length,
        2,
        'Uploaded file should be the only attachment added'
    );
});

QUnit.test('no conflict multi-company multi-tab', async function (assert) {
    assert.expect(1);

    this.data['res.company'] = {
        fields: {
            id: { type: 'integer' },
            name: { string: "Name", type: 'char' },
        },
        records: [
            {id:1, name:'Company A'},
            {id:2, name:'Company B'},
        ]
    };
    /* We simulate a multi-tab env by selecting Company A in the window and by setting the cookie to Company B */
    $.bbq.pushState({'cids': 1});
    utils.set_cookie('cids', 2);

    await this.start();
    const fileUploader1 = await this.createFileUploaderComponent();
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
    const cookie = utils.get_cookie('cids');
    assert.strictEqual(
        cookie,
        '1',
        'Company A should have been set in the cookie'
    );
});

});
});
});

});
