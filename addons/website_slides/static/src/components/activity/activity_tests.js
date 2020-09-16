/** @odoo-module alias=website_slides.components.Activity.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('website_slides', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Activity', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('grant course access', async function (assert) {
    assert.expect(8);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'action_grant_access') {
                assert.strictEqual(
                    args.args.length,
                    1,
                );
                assert.strictEqual(
                    args.args[0].length,
                    1,
                );
                assert.strictEqual(
                    args.args[0][0],
                    100,
                );
                assert.strictEqual(
                    args.kwargs.partner_id,
                    5,
                );
                assert.step('access_grant');
            }
            return this._super(...arguments);
        },
    });
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            $$$canWrite: true,
            $$$id: 100,
            $$$requestingPartner: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$displayName: "Pauvre pomme",
                    $$$id: 5,
                },
            ),
            $$$thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$id: 100,
                    $$$model: 'slide.channel',
                },
            ),
            $$$type: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$displayName: "Access Request",
                    $$$id: 1,
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Activity',
        { activity },
    );
    assert.containsOnce(
        document.body,
        '.o-Activity',
        "should have activity component",
    );
    assert.containsOnce(
        document.body,
        '.o-Activity-grantAccessButton',
        "should have grant access button",
    );

    document.querySelector('.o-Activity-grantAccessButton').click();
    assert.verifySteps(
        ['access_grant'],
        "Grant button should trigger the right rpc call",
    );
});

QUnit.test('refuse course access', async function (assert) {
    assert.expect(8);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'action_refuse_access') {
                assert.strictEqual(
                    args.args.length,
                    1,
                );
                assert.strictEqual(
                    args.args[0].length,
                    1,
                );
                assert.strictEqual(
                    args.args[0][0],
                    100,
                );
                assert.strictEqual(
                    args.kwargs.partner_id,
                    5,
                );
                assert.step('access_refuse');
            }
            return this._super(...arguments);
        },
    });
    const activity = env.services.action.dispatch(
        'Activity/create',
        {
            $$$canWrite: true,
            $$$id: 100,
            $$$requestingPartner: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$displayName: "Pauvre pomme",
                    $$$id: 5,
                },
            ),
            $$$thread: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$id: 100,
                    $$$model: 'slide.channel',
                },
            ),
            $$$type: env.services.action.dispatch(
                'RecordFieldCommand/insert',
                {
                    $$$displayName: "Access Request",
                    $$$id: 1,
                },
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Activity',
        { activity },
    );
    assert.containsOnce(
        document.body,
        '.o-Activity',
        "should have activity component",
    );
    assert.containsOnce(
        document.body,
        '.o-Activity-refuseAccessButton',
        "should have refuse access button",
    );

    document.querySelector('.o-Activity-refuseAccessButton').click();
    assert.verifySteps(
        ['access_refuse'],
        "refuse button should trigger the right rpc call",
    );
});

});
});
});
