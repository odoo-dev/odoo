/** @odoo-module alias=mail.components.ComposerSuggestion.channelTests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ComposerSuggestion', {}, function () {
QUnit.module('channelTests.js', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('channel mention suggestion displayed', async function (assert) {
    assert.expect(1);

    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/findById',
        {
            id: 20,
            model: 'mail.channel',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'Thread',
            record: thread,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Channel mention suggestion should be present",
    );
});

QUnit.test('channel mention suggestion correct data', async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        {
            id: 20,
            name: "General",
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/findById',
        {
            id: 20,
            model: 'mail.channel',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'Thread',
            record: thread,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Channel mention suggestion should be present",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part1',
        "Channel name should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part1').textContent,
        "General",
        "Channel name should be displayed",
    );
});

QUnit.test('channel mention suggestion active', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createServer();
    const thread = env.services.action.dispatch(
        'Thread/findById',
        {
            id: 20,
            model: 'mail.channel',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'Thread',
            record: thread,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Channel mention suggestion should be displayed",
    );
    assert.hasClass(
        document.querySelector('.o-ComposerSuggestion'),
        'active',
        "should be active initially",
    );
});

});
});
});
