/** @odoo-module alias=mail.components.AttachmentBox.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import dropFiles from 'mail.utils.test.dropFiles';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import dragenterFiles from 'mail.utils.test.dragenterFiles';

import { createFile } from 'web.test_utils_file';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('AttachmentBox', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('base empty rendering', async function (assert) {
    assert.expect(4);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            id: 100,
            model: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'AttachmentBox',
        { thread },
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox',
        "should have an attachment box",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox-buttonAdd',
        "should have a button add",
    );
    assert.containsOnce(
        document.body,
        '.o-FileUploader-input',
        "should have a file input",
    );
    assert.containsNone(
        document.body,
        `
            .o-AttachmentBox
            .o-Attachment
        `,
        "should not have any attachment",
    );
});

QUnit.test('base non-empty rendering', async function (assert) {
    assert.expect(6);

    this.data['ir.attachment'].records.push(
        {
            mimetype: 'text/plain',
            name: 'Blah.txt',
            res_id: 100,
            res_model: 'res.partner',
        },
        {
            mimetype: 'text/plain',
            name: 'Blu.txt',
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                assert.step('ir.attachment/search_read');
            }
            return this._super(...arguments);
        },
    });
    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            id: 100,
            model: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Thread/fetchAttachments',
        thread,
    );
    await env.services.action.dispatch(
        'Component/mount',
        'AttachmentBox',
        { thread },
    );
    assert.verifySteps(
        ['ir.attachment/search_read'],
        "should have fetched attachments",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox',
        "should have an attachment box",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox-buttonAdd',
        "should have a button add",
    );
    assert.containsOnce(
        document.body,
        '.o-FileUploader-input',
        "should have a file input",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox-AttachmentList',
        "should have an attachment list",
    );
});

QUnit.test('attachment box: drop attachments', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            id: 100,
            model: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Thread/fetchAttachments',
        thread,
    );
    await env.services.action.dispatch(
        'Component/mount',
        'AttachmentBox',
        { thread },
    );
    const files = [
        await createFile({
            content: 'hello, world',
            contentType: 'text/plain',
            name: 'text.txt',
        }),
    ];
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox',
        "should have an attachment box",
    );

    await afterNextRender(
        () => dragenterFiles(document.querySelector('.o-AttachmentBox')),
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentBox-dropZone',
        "should have a drop zone",
    );
    assert.containsNone(
        document.body,
        `
            .o-AttachmentBox
            .o-Attachment
        `,
        "should have no attachment before files are dropped",
    );

    await afterNextRender(
        () => dropFiles(
            document.querySelector('.o-AttachmentBox-dropZone'),
            files,
        ),
    );
    assert.containsOnce(
        document.body,
        `
            .o-AttachmentBox
            .o-Attachment
        `,
        "should have 1 attachment in the box after files dropped",
    );

    await afterNextRender(
        () => dragenterFiles(document.querySelector('.o-AttachmentBox')),
    );
    const file1 = await createFile({
        content: 'hello, world',
        contentType: 'text/plain',
        name: 'text2.txt',
    });
    const file2 = await createFile({
        content: 'hello, world',
        contentType: 'text/plain',
        name: 'text3.txt',
    });
    await afterNextRender(
        () => dropFiles(
            document.querySelector('.o-AttachmentBox-dropZone'),
            [file1, file2],
        ),
    );
    assert.containsN(
        document.body,
        `
            .o-AttachmentBox
            .o-Attachment
        `,
        3,
        "should have 3 attachments in the box after files dropped",
    );
});

QUnit.test('view attachments', async function (assert) {
    assert.expect(7);

    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'DialogManager',
    );
    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            attachments: [
                env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        id: 143,
                        mimetype: 'text/plain',
                        name: 'Blah.txt'
                    },
                ),
                env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    {
                        id: 144,
                        mimetype: 'text/plain',
                        name: 'Blu.txt'
                    },
                ),
            ],
            id: 100,
            model: 'res.partner',
        },
    );
    const firstAttachment = env.services.action.dispatch(
        'Attachment/findById',
        { id: 143 },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'AttachmentBox',
        { thread },
    );
    await afterNextRender(
        () => document.querySelector(`
            .o-Attachment[data-attachment-local-id="${firstAttachment.localId}"]
            .o-Attachment-image
        `).click(),
    );
    assert.containsOnce(
        document.body,
        '.o-Dialog',
        "a dialog should have been opened once attachment image is clicked",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentViewer',
        "an attachment viewer should have been opened once attachment image is clicked",
    );
    assert.strictEqual(
        document.querySelector('.o-AttachmentViewer-name').textContent,
        'Blah.txt',
        "attachment viewer iframe should point to clicked attachment",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentViewer-buttonNavigationNext',
        "attachment viewer should allow to see next attachment",
    );

    await afterNextRender(
        () => document.querySelector('.o-AttachmentViewer-buttonNavigationNext').click(),
    );
    assert.strictEqual(
        document.querySelector('.o-AttachmentViewer-name').textContent,
        'Blu.txt',
        "attachment viewer iframe should point to next attachment of attachment box",
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentViewer-buttonNavigationNext',
        "attachment viewer should allow to see next attachment",
    );

    await afterNextRender(
        () => document.querySelector('.o-AttachmentViewer-buttonNavigationNext').click(),
    );
    assert.strictEqual(
        document.querySelector('.o-AttachmentViewer-name').textContent,
        'Blah.txt',
        "attachment viewer iframe should point anew to first attachment",
    );
});

QUnit.test('remove attachment should ask for confirmation', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            attachments: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    id: 143,
                    mimetype: 'text/plain',
                    name: 'Blah.txt'
                },
            ),
            id: 100,
            model: 'res.partner',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'AttachmentBox',
        { thread },
    );
    assert.containsOnce(
        document.body,
        '.o-Attachment',
        "should have an attachment",
    );
    assert.containsOnce(
        document.body,
        '.o-Attachment-asideItemUnlink',
        "attachment should have a delete button",
    );

    await afterNextRender(
        () => document.querySelector('.o-Attachment-asideItemUnlink').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentDeleteConfirmDialog',
        "A confirmation dialog should have been opened",
    );
    assert.strictEqual(
        document.querySelector('.o-AttachmentDeleteConfirmDialog-mainText').textContent,
        `Do you really want to delete "Blah.txt"?`,
        "Confirmation dialog should contain the attachment delete confirmation text",
    );

    // Confirm the deletion
    await afterNextRender(
        () => document.querySelector('.o-AttachmentDeleteConfirmDialog-confirmButton').click(),
    );
    assert.containsNone(
        document.body,
        '.o-Attachment',
        "should no longer have an attachment",
    );
});

});
});
});
