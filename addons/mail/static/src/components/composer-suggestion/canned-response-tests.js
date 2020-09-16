/** @odoo-module alias=mail.components.ComposerSuggestion.cannedResponseTests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ComposerSuggestion', {}, function () {
QUnit.module('cannedResponseTests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('canned response suggestion displayed', async function (assert) {
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
    const cannedResponse = env.services.action.dispatch(
        'CannedResponse/create',
        {
            id: 7,
            source: 'hello',
            substitution: "Hello, how are you?",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'CannedResponse',
            record: cannedResponse,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Canned response suggestion should be present",
    );
});

QUnit.test('canned response suggestion correct data', async function (assert) {
    assert.expect(5);

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
    const cannedResponse = env.services.action.dispatch(
        'CannedResponse/create',
        {
            id: 7,
            source: 'hello',
            substitution: "Hello, how are you?",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'CannedResponse',
            record: cannedResponse,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Canned response suggestion should be present",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part1',
        "Canned response source should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part1').textContent,
        "hello",
        "Canned response source should be displayed",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part2',
        "Canned response substitution should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part2').textContent,
        "Hello, how are you?",
        "Canned response substitution should be displayed",
    );
});

QUnit.test('canned response suggestion active', async function (assert) {
    assert.expect(2);

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
    const cannedResponse = env.services.action.dispatch(
        'CannedResponse/create',
        {
            id: 7,
            source: 'hello',
            substitution: "Hello, how are you?",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'CannedResponse',
            record: cannedResponse,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Canned response suggestion should be displayed",
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
