/** @odoo-module alias=mail.components.FollowerListMenu.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import Bus from 'web.Bus';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('FollowerListMenu', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('base rendering not editable', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowerListMenu', {
        thread,
        isDisabled: true,
    });
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "should have followers menu component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-buttonFollowers',
        "should have followers button",
    );
    assert.ok(
        document.querySelector('.o-FollowerListMenu-buttonFollowers').disabled,
        "followers button should be disabled",
    );
    assert.containsNone(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should not be opened",
    );

    document.querySelector('.o-FollowerListMenu-buttonFollowers').click();
    assert.containsNone(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should still be closed as button is disabled",
    );
});

QUnit.test('base rendering editable', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowerListMenu', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "should have followers menu component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-buttonFollowers',
        "should have followers button",
    );
    assert.notOk(
        document.querySelector('.o-FollowerListMenu-buttonFollowers').disabled,
        "followers button should not be disabled",
    );
    assert.containsNone(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should not be opened",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-buttonFollowers').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be opened",
    );
});

QUnit.test('click on "add followers" button', async function (assert) {
    assert.expect(16);

    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.step('action:open_view');
        assert.strictEqual(
            payload.action.context.default_res_model,
            'res.partner',
            "'The 'add followers' action should contain thread model in context'",
        );
        assert.notOk(
            payload.action.context.mail_invite_follower_channel_only,
            "The 'add followers' action should not be restricted to channels only",
        );
        assert.strictEqual(
            payload.action.context.default_res_id,
            100,
            "The 'add followers' action should contain thread id in context",
        );
        assert.strictEqual(
            payload.action.res_model,
            'mail.wizard.invite',
            "The 'add followers' action should be a wizard invite of mail module",
        );
        assert.strictEqual(
            payload.action.type,
            "ir.actions.act_window",
            "The 'add followers' action should be of type 'ir.actions.act_window'",
        );
        const partner = this.data['res.partner'].records.find(
            partner => partner.id === payload.action.context.default_res_id,
        );
        partner.message_follower_ids.push(1);
        payload.options.on_close();
    });
    this.data['mail.followers'].records.push(
        {
            email: "bla@bla.bla",
            id: 1,
            is_active: true,
            is_editable: true,
            name: "François Perusse",
            partner_id: 42,
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv({
        env: { bus },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowerListMenu', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "should have followers menu component",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-buttonFollowers',
        "should have followers button",
    );
    assert.strictEqual(
        document.querySelector('.o-FollowerListMenu-buttonFollowersCount').textContent,
        "0",
        "Followers counter should be equal to 0",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-buttonFollowers').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be opened",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-addFollowersButton',
        "followers dropdown should contain a 'Add followers' button",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-addFollowersButton').click(),
    );
    assert.containsNone(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be closed after click on 'Add followers'",
    );
    assert.verifySteps([
        'action:open_view',
    ]);
    assert.strictEqual(
        document.querySelector('.o-FollowerListMenu-buttonFollowersCount').textContent,
        "1",
        "Followers counter should now be equal to 1",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-buttonFollowers').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerMenu-follower',
        "Follower list should be refreshed and contain a follower",
    );
    assert.strictEqual(
        document.querySelector('.o-Follower-name').textContent,
        "François Perusse",
        "Follower added in follower list should be the one added",
    );
});

QUnit.test('click on "add channels" button', async function (assert) {
    assert.expect(16);

    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.step('action:open_view');
        assert.strictEqual(
            payload.action.context.default_res_model,
            'res.partner',
            "'The 'add channels' action should contain thread model in context'",
        );
        assert.ok(
            payload.action.context.mail_invite_follower_channel_only,
            "The 'add channels' action should be restricted to channels only",
        );
        assert.strictEqual(
            payload.action.context.default_res_id,
            100,
            "The 'add channels' action should contain thread id in context",
        );
        assert.strictEqual(
            payload.action.res_model,
            'mail.wizard.invite',
            "The 'add channels' action should be a wizard invite of mail module",
        );
        assert.strictEqual(
            payload.action.type,
            "ir.actions.act_window",
            "The 'add channels' action should be of type 'ir.actions.act_window'",
        );
        const partner = this.data['res.partner'].records.find(
            partner => partner.id === payload.action.context.default_res_id,
        );
        partner.message_follower_ids.push(1);
        payload.options.on_close();
    });
    this.data['mail.followers'].records.push(
        {
            channel_id: 42,
            email: "bla@bla.bla",
            id: 1,
            is_active: true,
            is_editable: true,
            name: "Supa channel",
            res_id: 100,
            res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv({
        env: { bus },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Component/mount', 'FollowerListMenu', { thread });
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "should have followers menu component",
    );
    assert.strictEqual(
        document.querySelector('.o-FollowerListMenu-buttonFollowersCount').textContent,
        "0",
        "Followers counter should be equal to 0",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-buttonFollowers',
        "should have followers button",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-buttonFollowers').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be opened",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu-addChannelsButton',
        "followers dropdown should contain a 'Add channels' button",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-addChannelsButton').click(),
    );
    assert.containsNone(
        document.body,
        '.o-FollowerListMenu-dropdown',
        "followers dropdown should be closed after click on 'add channels'",
    );
    assert.verifySteps(
        ['action:open_view'],
    );
    assert.strictEqual(
        document.querySelector('.o-FollowerListMenu-buttonFollowersCount').textContent,
        "1",
        "Followers counter should now be equal to 1",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerListMenu-buttonFollowers').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerMenu-follower',
        "Follower list should be refreshed and contain a follower",
    );
    assert.strictEqual(
        document.querySelector('.o-Follower-name').textContent,
        "Supa channel",
        "Follower added in follower list should be the one added",
    );
});

QUnit.test('click on remove follower', async function (assert) {
    assert.expect(6);

    const self = this;
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (route.includes('message_unsubscribe')) {
                assert.step('message_unsubscribe');
                assert.deepEqual(
                    args.args,
                    [
                        [100],
                        [self.env.services.model.messaging.$$$currentPartner().$$$id()],
                        [],
                    ],
                    "message_unsubscribe should be called with right argument",
                );
            }
            return this._super(...arguments);
        },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Follower/create', {
        $$$followedThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
        $$$id: 2,
        $$$isActive: true,
        $$$isEditable: true,
        $$$partner: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$email: "bla@bla.bla",
            $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
            $$$name: "François Perusse",
        }),
    });
    await env.services.action.dispatch('Component/mount', 'FollowerListMenu', { thread });
    await afterNextRender(() =>
        document.querySelector('.o-FollowerListMenu-buttonFollowers').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-removeButton',
        "should display a remove button",
    );

    await afterNextRender(
        () => document.querySelector('.o-Follower-removeButton').click(),
    );
    assert.verifySteps(
        ['message_unsubscribe'],
        "clicking on remove button should call 'message_unsubscribe' route",
    );
    assert.containsNone(
        document.body,
        '.o-Follower',
        "should no longer have follower component",
    );
});

});
});
});
