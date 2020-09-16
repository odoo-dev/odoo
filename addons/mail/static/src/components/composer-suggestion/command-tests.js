/** @odoo-module alias=mail.components.ComposerSuggestion.commandTests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ComposerSuggestion', {}, function () {
QUnit.module('commandTests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('command suggestion displayed', async function (assert) {
    assert.expect(1);

    this.data['mail.channel'].records.push(
        { id: 20 }
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
    const command = env.services.action.dispatch(
        'ChannelCommand/create',
        {
            help: "Displays who it is",
            name: 'whois',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'ChannelCommand',
            record: command,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Command suggestion should be present",
    );
});

QUnit.test('command suggestion correct data', async function (assert) {
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
    const command = env.services.action.dispatch(
        'ChannelCommand/create',
        {
            help: "Displays who it is",
            name: 'whois',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'ChannelCommand',
            record: command,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Command suggestion should be present",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part1',
        "Command name should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part1').textContent,
        "whois",
        "Command name should be displayed",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part2',
        "Command help should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part2').textContent,
        "Displays who it is",
        "Command help should be displayed",
    );
});

QUnit.test('command suggestion active', async function (assert) {
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
    const command = env.services.action.dispatch(
        'ChannelCommand/create',
        {
            name: 'whois',
            help: "Displays who it is",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'ChannelCommand',
            record: command,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Command suggestion should be displayed",
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
