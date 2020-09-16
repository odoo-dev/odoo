/** @odoo-module alias=mail.models.Message.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import { str_to_datetime } from 'web.time';

QUnit.module('mail', {}, function () {
QUnit.module('models', {}, function () {
QUnit.module('Message', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('create', async function (assert) {
    assert.expect(31);

    createServer(this.data);
    const env = await createEnv();
    assert.notOk(
        env.services.action.dispatch(
            'Partner/findById',
            { id: 5 },
        ),
    );
    assert.notOk(
        env.services.action.dispatch(
            'Thread/findById',
            {
                id: 100,
                model: 'mail.channel',
            },
        ),
    );
    assert.notOk(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.notOk(
        env.services.action.dispatch(
            'Message/findById',
            { id: 4000 },
        ),
    );

    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            id: 100,
            model: 'mail.channel',
            name: "General",
        },
    );
    const message = env.services.action.dispatch(
        'Message/create',
        {
            attachments: env.services.action.dispatch(
                'RecordFieldCommand/insertAndReplace',
                {
                    filename: "test.txt",
                    id: 750,
                    mimetype: 'text/plain',
                    name: "test.txt",
                },
            ),
            author: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    displayName: "Demo",
                    id: 5,
                },
            ),
            body: "<p>Test</p>",
            date: moment(str_to_datetime("2019-05-05 10:00:00")),
            id: 4000,
            isNeedaction: true,
            isStarred: true,
            originThread: env.services.action.dispatch(
                'RecordFieldCommand/link',
                thread,
            ),
        },
    );

    assert.ok(
        env.services.action.dispatch(
            'Partner/findById',
            { id: 5 },
        ),
    );
    assert.ok(
        env.services.action.dispatch(
            'Thread/findById',
            {
                id: 100,
                model: 'mail.channel',
            },
        ),
    );
    assert.ok(
        env.services.action.dispatch(
            'Attachment/findById',
            { id: 750 },
        ),
    );
    assert.ok(
        env.services.action.dispatch(
            'Message/findById',
            { id: 4000 },
        ),
    );
    assert.ok(message);
    assert.strictEqual(
        env.services.action.dispatch(
            'Message/findById',
            { id: 4000 },
        ),
        message,
    );
    assert.strictEqual(
        message.body(),
        "<p>Test</p>",
    );
    assert.ok(
        message.date() instanceof moment,
    );
    assert.strictEqual(
        moment(message.date()).utc().format('YYYY-MM-DD hh:mm:ss'),
        "2019-05-05 10:00:00",
    );
    assert.strictEqual(
        message.id(),
        4000,
    );
    assert.strictEqual(
        message.originThread(),
        env.services.action.dispatch(
            'Thread/findById',
            {
                id: 100,
                model: 'mail.channel',
            },
        ),
    );
    assert.ok(
        message.threads().includes(
            env.services.action.dispatch(
                'Thread/findById',
                {
                    id: 100,
                    model: 'mail.channel',
                },
            ),
        ),
    );
    // from partnerId being in needaction_partner_ids
    assert.ok(
        message.threads().includes(
            env.services.model.messaging.inbox(),
        )
    );
    // from partnerId being in starred_partner_ids
    assert.ok(
        message.threads().includes(
            env.services.model.messaging.starred(),
        ),
    );
    const attachment = env.services.action.dispatch(
        'Attachment/findById',
        { id: 750 },
    );
    assert.ok(attachment);
    assert.strictEqual(
        attachment.filename(),
        "test.txt",
    );
    assert.strictEqual(
        attachment.id(),
        750,
    );
    assert.notOk(
        attachment.isUploading(),
    );
    assert.strictEqual(
        attachment.mimetype(),
        'text/plain',
    );
    assert.strictEqual(
        attachment.name(),
        "test.txt",
    );
    const channel = env.services.action.dispatch(
        'Thread/findById',
        {
            id: 100,
            model: 'mail.channel',
        },
    );
    assert.ok(channel);
    assert.strictEqual(
        channel.model(),
        'mail.channel',
    );
    assert.strictEqual(
        channel.id(),
        100,
    );
    assert.strictEqual(
        channel.name(),
        "General",
    );
    const partner = env.services.action.dispatch(
        'Partner/findById',
        { id: 5 },
    );
    assert.ok(partner);
    assert.strictEqual(
        partner.displayName(),
        "Demo",
    );
    assert.strictEqual(
        partner.id(),
        5,
    );
});

QUnit.test('message without body should be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        { id: 11 },
    );
    assert.ok(message.isEmpty());
});

QUnit.test('message with body "" should be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test('message with body "<p></p>" should be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<p></p>",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test('message with body "<p><br></p>" should be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<p><br></p>",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test('message with body "<p><br/></p>" should be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<p><br/></p>",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test(String.raw`message with body "<p>\n</p>" should be considered empty`, async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<p>\n</p>",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test(String.raw`message with body "<p>\r\n\r\n</p>" should be considered empty`, async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<p>\r\n\r\n</p>",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test('message with body "<p>   </p>  " should be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<p>   </p>  ",
            id: 11,
        },
    );
    assert.ok(message.isEmpty());
});

QUnit.test(`message with body "<img src=''>" should not be considered empty`, async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "<img src=''>",
            id: 11,
        },
    );
    assert.notOk(message.isEmpty());
});

QUnit.test('message with body "test" should not be considered empty', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch(
        'Message/create',
        {
            body: "test",
            id: 11,
        },
    );
    assert.notOk(message.isEmpty());
});

});
});
});
