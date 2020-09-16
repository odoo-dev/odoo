/** @odoo-module alias=mail.components.FollowButton.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('FollowButton', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('base rendering not editable', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowButton', {
        isDisabled: true,
        thread,
    });
    assert.containsOnce(
        document.body,
        '.o-FollowButton',
        "should have follow button component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowButton-follow',
        "should have 'Follow' button",
    );
    assert.ok(
        document.querySelector('.o-FollowButton-follow').disabled,
        "'Follow' button should be disabled",
    );
});

QUnit.test('base rendering editable', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowButton', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowButton',
        "should have follow button component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowButton-follow',
        "should have 'Follow' button",
    );
    assert.notOk(
        document.querySelector('.o-FollowButton-follow').disabled,
        "'Follow' button should be disabled",
    );
});

QUnit.test('hover following button', async function (assert) {
    assert.expect(8);

    this.data['mail.followers'].records.push(
        {
            id: 1,
            is_active: true,
            is_editable: true,
            partner_id: this.data.currentPartnerId,
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 100,
            message_follower_ids: [1],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    env.services.action.dispatch('Thread/follow', thread);
    await env.services.action.dispatch('Component/mount', 'FollowButton', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowButton',
        "should have follow button component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowButton-unfollow',
        "should have 'Unfollow' button",
    );
    assert.strictEqual(
        document.querySelector('.o-FollowButton-unfollow').textContent.trim(),
        'Following',
        "'unfollow' button should display 'Following' as text when not hovered",
    );
    assert.containsNone(
        document.querySelector('.o-FollowButton-unfollow'),
        '.fa-times',
        "'unfollow' button should not contain a cross icon when not hovered",
    );
    assert.containsOnce(
        document.querySelector('.o-FollowButton-unfollow'),
        '.fa-check',
        "'unfollow' button should contain a check icon when not hovered",
    );

    await afterNextRender(
        () => {
            document
                .querySelector('.o-FollowButton-unfollow')
                .dispatchEvent(new window.MouseEvent('mouseenter'));
        },
    );
    assert.strictEqual(
        document.querySelector('.o-FollowButton-unfollow').textContent.trim(),
        'Unfollow',
        "'unfollow' button should display 'Unfollow' as text when hovered",
    );
    assert.containsOnce(
        document.querySelector('.o-FollowButton-unfollow'),
        '.fa-times',
        "'unfollow' button should contain a cross icon when hovered",
    );
    assert.containsNone(
        document.querySelector('.o-FollowButton-unfollow'),
        '.fa-check',
        "'unfollow' button should not contain a check icon when hovered",
    );
});

QUnit.test('click on "follow" button', async function (assert) {
    assert.expect(7);

    this.data['mail.followers'].records.push(
        {
            id: 1,
            is_active: true,
            is_editable: true,
            partner_id: this.data.currentPartnerId,
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 100,
            message_follower_ids: [1],
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route.includes('message_subscribe')) {
                assert.step('rpc:message_subscribe');
            } else if (route.includes('mail/read_followers')) {
                assert.step('rpc:mail/read_followers');
            }
            return this._super(...arguments);
        },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowButton', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowButton',
        "should have follow button component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowButton-follow',
        "should have button follow",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowButton-follow').click(),
    );
    assert.verifySteps([
        'rpc:message_subscribe',
        'rpc:mail/read_followers',
    ]);
    assert.containsNone(
        document.body,
        '.o-FollowButton-follow',
        "should not have follow button after clicked on follow",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowButton-unfollow',
        "should have unfollow button after clicked on follow",
    );
});

QUnit.test('click on "unfollow" button', async function (assert) {
    assert.expect(7);

    this.data['mail.followers'].records.push(
        {
            id: 1,
            is_active: true,
            is_editable: true,
            partner_id: this.data.currentPartnerId,
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 100,
            message_follower_ids: [1],
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route.includes('message_unsubscribe')) {
                assert.step('rpc:message_unsubscribe');
            }
            return this._super(...arguments);
        },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    env.services.action.dispatch('Thread/follow', thread);
    await env.services.action.dispatch('Component/mount', 'FollowButton', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowButton',
        "should have follow button component",
    );
    assert.containsNone(
        document.body,
        '.o-FollowButton-follow',
        "should not have button follow",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowButton-unfollow',
        "should have button unfollow",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowButton-unfollow').click(),
    );
    assert.verifySteps(['rpc:message_unsubscribe']);
    assert.containsOnce(
        document.body,
        '.o-FollowButton-follow',
        "should have follow button after clicked on unfollow",
    );
    assert.containsNone(
        document.body,
        '.o-FollowButton-unfollow',
        "should not have unfollow button after clicked on unfollow",
    );
});

});
});
});
