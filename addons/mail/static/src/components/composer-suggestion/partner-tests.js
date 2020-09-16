/** @odoo-module alias=mail.components.ComposerSuggestion.partnerTests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ComposerSuggestion', {}, function () {
QUnit.module('partnerTests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('partner mention suggestion displayed', async function (assert) {
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
    const partner = env.services.action.dispatch(
        'Partner/create',
        {
            id: 7,
            imStatus: 'online',
            name: "Demo User",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'Partner',
            record: partner,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Partner mention suggestion should be present",
    );
});

QUnit.test('partner mention suggestion correct data', async function (assert) {
    assert.expect(6);

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
    const partner = env.services.action.dispatch(
        'Partner/create',
        {
            email: "demo_user@odoo.com",
            id: 7,
            imStatus: 'online',
            name: "Demo User",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'Partner',
            record: partner,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Partner mention suggestion should be present",
    );
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon',
        "Partner's im status should be displayed",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part1',
        "Partner's name should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part1').textContent,
        "Demo User",
        "Partner's name should be displayed",
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion-part2',
        "Partner's email should be present",
    );
    assert.strictEqual(
        document.querySelector('.o-ComposerSuggestion-part2').textContent,
        "(demo_user@odoo.com)",
        "Partner's email should be displayed",
    );
});

QUnit.test('partner mention suggestion active', async function (assert) {
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
    const partner = env.services.action.dispatch(
        'Partner/create',
        {
            id: 7,
            imStatus: 'online',
            name: "Demo User",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ComposerSuggestion',
        {
            composer: thread.composer(),
            isActive: true,
            modelName: 'Partner',
            record: partner,
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ComposerSuggestion',
        "Partner mention suggestion should be displayed",
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
