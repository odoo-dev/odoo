/** @odoo-module alias=mail_bot.models.MessagingInitializer.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail_bot', {}, function () {
QUnit.module('models', {}, function () {
QUnit.module('MessagingInitializer', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});


QUnit.test('OdooBot initialized at init', async function (assert) {
    // TODO this test should be completed in combination with
    // implementing _mockMailChannelInitOdooBot task-2300480
    assert.expect(2);

    createServer(this.data);
    await createEnv({
        env: {
            session: {
                odoobot_initialized: false,
            },
        },
        async mockRPC(route, args) {
            if (args.method === 'init_odoobot') {
                assert.step('init_odoobot');
            }
            return this._super(...arguments);
        },
    });
    assert.verifySteps(
        ['init_odoobot'],
        "should have initialized OdooBot at init",
    );
});

});
});
});
