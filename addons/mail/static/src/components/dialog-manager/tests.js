/** @odoo-module alias=mail.components.DialogManager.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';
import makeDeferred from 'mail.utils.makeDeferred';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('DialogManager', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.skip('[technical] messaging not created', async function (assert) {
    /**
     * Creation of messaging in env is async due to generation of models being
     * async. Generation of models is async because it requires parsing of all
     * JS modules that contain pieces of model definitions.
     *
     * Time of having no messaging is very short, almost imperceptible by user
     * on UI, but the display should not crash during this critical time period.
     */
    assert.expect(2);

    const def = makeDeferred();
    createServer(this.data);
    const env = await createEnv({
        async beforeGenerateModels() {
            await def;
        },
        waitUntilMessagingCondition: 'none',
    });
    await env.services.action.dispatch('Component/mount', 'DialogManager');
    assert.containsOnce(
        document.body,
        '.o-DialogManager',
        "should have dialog manager even when messaging is not yet created",
    );

    // simulate messaging being created
    def.resolve();
    await nextAnimationFrame();

    assert.containsOnce(
        document.body,
        '.o-DialogManager',
        "should still contain dialog manager after messaging has been created",
    );
});

QUnit.test('initial mount', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'DialogManager');
    assert.containsOnce(
        document.body,
        '.o-DialogManager',
        "should have dialog manager",
    );
});

});
});
});
