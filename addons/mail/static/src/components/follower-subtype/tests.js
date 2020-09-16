/** @odoo-module alias=mail.components.FollowerSubtype.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('FollowerSubtype', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('simplest layout of a followed subtype', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    const follower = env.services.action.dispatch('Follower/create', {
        $$$channel: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 1,
            $$$model: 'mail.channel',
            $$$name: "François Perusse",
        }),
        $$$followedThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
        $$$id: 2,
        $$$isActive: true,
        $$$isEditable: true,
    });
    const followerSubtype = env.services.action.dispatch('FollowerSubtype/create', {
        $$$id: 1,
        $$$isDefault: true,
        $$$isInternal: false,
        $$$name: "Dummy test",
        $$$resModel: 'res.partner'
    });
    env.services.action.dispatch('Record/update', follower, {
        $$$selectedSubtypes: env.services.action.dispatch('RecordFieldCommand/link', followerSubtype),
        $$$subtypes: env.services.action.dispatch('RecordFieldCommand/link', followerSubtype),
    });
    await env.services.action.dispatch('Component/mount', 'FollowerSubtype', {
        follower,
        followerSubtype,
    });
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype',
        "should have follower subtype component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype-label',
        "should have a label",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype-checkbox',
        "should have a checkbox",
    );
    assert.strictEqual(
        document.querySelector('.o-FollowerSubtype-label').textContent,
        "Dummy test",
        "should have the name of the subtype as label",
    );
    assert.ok(
        document.querySelector('.o-FollowerSubtype-checkbox').checked,
        "checkbox should be checked as follower subtype is followed",
    );
});

QUnit.test('simplest layout of a not followed subtype', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    const follower = env.services.action.dispatch('Follower/create', {
        $$$channel: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 1,
            $$$model: 'mail.channel',
            $$$name: "François Perusse",
        }),
        $$$followedThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
        $$$id: 2,
        $$$isActive: true,
        $$$isEditable: true,
    });
    const followerSubtype = env.services.action.dispatch('FollowerSubtype/create', {
        $$$id: 1,
        $$$isDefault: true,
        $$$isInternal: false,
        $$$name: "Dummy test",
        $$$resModel: 'res.partner',
    });
    env.services.action.dispatch('Record/update', follower, {
        $$$subtypes: env.services.action.dispatch('RecordFieldCommand/link', followerSubtype),
    });
    await env.services.action.dispatch('Component/mount', 'FollowerSubtype', {
        follower,
        followerSubtype,
    });
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype',
        "should have follower subtype component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype-label',
        "should have a label",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype-checkbox',
        "should have a checkbox",
    );
    assert.strictEqual(
        document.querySelector('.o-FollowerSubtype-label').textContent,
        "Dummy test",
        "should have the name of the subtype as label",
    );
    assert.notOk(
        document.querySelector('.o-FollowerSubtype-checkbox').checked,
        "checkbox should not be checked as follower subtype is not followed",
    );
});

QUnit.test('toggle follower subtype checkbox', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    const follower = env.services.action.dispatch('Follower/create', {
        $$$channel: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 1,
            $$$model: 'mail.channel',
            $$$name: "François Perusse",
        }),
        $$$followedThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
        $$$id: 2,
        $$$isActive: true,
        $$$isEditable: true,
    });
    const followerSubtype = env.services.action.dispatch('FollowerSubtype/create', {
        $$$id: 1,
        $$$isDefault: true,
        $$$isInternal: false,
        $$$name: "Dummy test",
        $$$resModel: 'res.partner',
    });
    env.services.action.dispatch('Record/update', follower, {
        $$$subtypes: env.services.action.dispatch('RecordFieldCommand/link', followerSubtype),
    });
    await env.services.action.dispatch('Component/mount', 'FollowerSubtype', {
        follower,
        followerSubtype,
    });
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype',
        "should have follower subtype component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtype-checkbox',
        "should have a checkbox",
    );
    assert.notOk(
        document.querySelector('.o-FollowerSubtype-checkbox').checked,
        "checkbox should not be checked as follower subtype is not followed",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerSubtype-checkbox').click(),
    );
    assert.ok(
        document.querySelector('.o-FollowerSubtype-checkbox').checked,
        "checkbox should now be checked",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerSubtype-checkbox').click(),
    );
    assert.notOk(
        document.querySelector('.o-FollowerSubtype-checkbox').checked,
        "checkbox should be no more checked",
    );
});

});
});
});
