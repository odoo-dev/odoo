/** @odoo-module alias=mail.components.Follower.tests **/

import makeDeferred from 'mail.utils.makeDeferred';
import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import Bus from 'web.Bus';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Follower', {}, function () {
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
    const follower = await env.services.action.dispatch('Follower/create', {
        $$$channel: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 1,
            $$$model: 'mail.channel',
            $$$name: "François Perusse",
        }),
        $$$followedThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
        $$$id: 2,
        $$$isActive: true,
        $$$isEditable: false,
    });
    await env.services.action.dispatch('Component/mount', 'Follower', { follower });
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-details',
        "should display a details part",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-avatar',
        "should display the avatar of the follower",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-name',
        "should display the name of the follower",
    );
    assert.containsNone(
        document.body,
        '.o-Follower-button',
        "should have no button as follower is not editable",
    );
});

QUnit.test('base rendering editable', async function (assert) {
    assert.expect(6);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    const follower = await env.services.action.dispatch('Follower/create', {
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
    await env.services.action.dispatch('Component/mount', 'Follower', { follower });
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-details',
        "should display a details part",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-avatar',
        "should display the avatar of the follower",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-name',
        "should display the name of the follower",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-editButton',
        "should have an edit button",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-removeButton',
        "should have a remove button",
    );
});

QUnit.test('click on channel follower details', async function (assert) {
    assert.expect(7);

    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.step('do_action');
        assert.strictEqual(
            payload.action.res_id,
            10,
            "The redirect action should redirect to the right res id (10)",
        );
        assert.strictEqual(
            payload.action.res_model,
            'mail.channel',
            "The redirect action should redirect to the right res model (mail.channel)",
        );
        assert.strictEqual(
            payload.action.type,
            "ir.actions.act_window",
            "The redirect action should be of type 'ir.actions.act_window'",
        );
    });
    this.data['mail.channel'].records.push(
        { id: 10 },
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
    const follower = await env.services.action.dispatch('Follower/create', {
        $$$channel: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 10,
            $$$model: 'mail.channel',
            $$$name: "channel",
        }),
        $$$followedThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
        $$$id: 2,
        $$$isActive: true,
        $$$isEditable: true,
    });
    await env.services.action.dispatch('Component/mount', 'Follower', { follower });
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-details',
        "should display a details part",
    );

    document.querySelector('.o-Follower-details').click();
    assert.verifySteps(
        ['do_action'],
        "clicking on channel should redirect to channel form view",
    );
});

QUnit.test('click on partner follower details', async function (assert) {
    assert.expect(7);

    const openFormDef = makeDeferred();
    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.step('do_action');
        assert.strictEqual(
            payload.action.res_id,
            3,
            "The redirect action should redirect to the right res id (3)",
        );
        assert.strictEqual(
            payload.action.res_model,
            'res.partner',
            "The redirect action should redirect to the right res model (res.partner)",
        );
        assert.strictEqual(
            payload.action.type,
            "ir.actions.act_window",
            "The redirect action should be of type 'ir.actions.act_window'",
        );
        openFormDef.resolve();
    });
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
    const follower = await env.services.action.dispatch('Follower/create', {
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
    await env.services.action.dispatch('Component/mount', 'Follower', { follower });
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-details',
        "should display a details part",
    );

    document.querySelector('.o-Follower-details').click();
    await openFormDef;
    assert.verifySteps(
        ['do_action'],
        "clicking on follower should redirect to partner form view",
    );
});

QUnit.test('click on edit follower', async function (assert) {
    assert.expect(5);

    this.data['mail.followers'].records.push(
        {
            id: 2,
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
            message_follower_ids: [2],
        },
    );
    createServer(this.data);
    const env = await createEnv({
        hasDialog: true,
        async mockRPC(route, args) {
            if (route.includes('/mail/read_subscription_data')) {
                assert.step('fetch_subtypes');
            }
            return this._super(...arguments);
        },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    await env.services.action.dispatch('Thread/refreshFollowers', thread);
    await env.services.action.dispatch('Component/mount', 'Follower', {
        follower: thread.$$$followers()[0],
    });
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-editButton',
        "should display an edit button",
    );

    await afterNextRender(
        () => document.querySelector('.o-Follower-editButton').click(),
    );
    assert.verifySteps(
        ['fetch_subtypes'],
        "clicking on edit follower should fetch subtypes",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtypeList',
        "A dialog allowing to edit follower subtypes should have been created",
    );
});

QUnit.test('edit follower and close subtype dialog', async function (assert) {
    assert.expect(6);

    this.data['res.partner'].records.push(
        { id: 100 },
    );
    createServer(this.data);
    const env = await createEnv({
        hasDialog: true,
        async mockRPC(route, args) {
            if (route.includes('/mail/read_subscription_data')) {
                assert.step('fetch_subtypes');
                return [{
                    default: true,
                    followed: true,
                    internal: false,
                    id: 1,
                    name: "Dummy test",
                    res_model: 'res.partner',
                }];
            }
            return this._super(...arguments);
        },
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 100,
        $$$model: 'res.partner',
    });
    const follower = await env.services.action.dispatch('Follower/create', {
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
    await env.services.action.dispatch('Component/mount', 'Follower', { follower });
    assert.containsOnce(
        document.body,
        '.o-Follower',
        "should have follower component",
    );
    assert.containsOnce(
        document.body,
        '.o-Follower-editButton',
        "should display an edit button",
    );

    await afterNextRender(
        () => document.querySelector('.o-Follower-editButton').click(),
    );
    assert.verifySteps(
        ['fetch_subtypes'],
        "clicking on edit follower should fetch subtypes",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerSubtypeList',
        "dialog allowing to edit follower subtypes should have been created",
    );

    await afterNextRender(
        () => document.querySelector('.o-FollowerSubtypeList-closeButton').click(),
    );
    assert.containsNone(
        document.body,
        '.o-DialogManager-dialog',
        "follower subtype dialog should be closed after clicking on close button",
    );
});

});
});
});
