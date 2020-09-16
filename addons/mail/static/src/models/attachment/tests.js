/** @odoo-module alias=mail.models.Attachment.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('models', {}, function () {
QUnit.module('Attachment', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('create (txt)', async function (assert) {
    assert.expect(9);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );

    const attachment = env.services.action.dispatch(
        'Attachment/create',
        {
            filename: "test.txt",
            id: 750,
            mimetype: 'text/plain',
            name: "test.txt",
        },
    );
    assert.ok(attachment);
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
        attachment,
    );
    assert.strictEqual(
        attachment.filename(),
        "test.txt",
    );
    assert.strictEqual(
        attachment.id(),
        750,
    );
    assert.notOk(attachment.isUploading());
    assert.strictEqual(
        attachment.mimetype(),
        'text/plain',
    );
    assert.strictEqual(
        attachment.name(),
        "test.txt",
    );
});

QUnit.test('displayName', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );

    const attachment = env.services.action.dispatch(
        'Attachment/create',
        {
            filename: "test.txt",
            id: 750,
            mimetype: 'text/plain',
            name: "test.txt",
        },
    );
    assert.ok(attachment);
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment,
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment.displayName(),
        "test.txt",
    );
});

QUnit.test('extension', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );

    const attachment = env.services.action.dispatch(
        'Attachment/create',
        {
            filename: "test.txt",
            id: 750,
            mimetype: 'text/plain',
            name: "test.txt",
        },
    );
    assert.ok(attachment);
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment,
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment.extension(),
        'txt',
    );
});

QUnit.test('fileType', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );

    const attachment = env.services.action.dispatch(
        'Attachment/create',
        {
            filename: "test.txt",
            id: 750,
            mimetype: 'text/plain',
            name: "test.txt",
        },
    );
    assert.ok(attachment);
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment,
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment.fileType(),
        'text',
    );
});

QUnit.test('isTextFile', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );

    const attachment = env.services.action.dispatch(
        'Attachment/create',
        {
            filename: "test.txt",
            id: 750,
            mimetype: 'text/plain',
            name: "test.txt",
        },
    );
    assert.ok(attachment);
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment,
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.ok(attachment.isTextFile());
});

QUnit.test('isViewable', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );

    const attachment = env.services.action.dispatch(
        'Attachment/create',
        {
            filename: "test.txt",
            id: 750,
            mimetype: 'text/plain',
            name: "test.txt",
        },
    );
    assert.ok(attachment);
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.strictEqual(
        attachment,
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.ok(attachment.isViewable());
});

});
});
});
