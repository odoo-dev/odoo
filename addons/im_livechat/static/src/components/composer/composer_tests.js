/** @odoo-module alias=hr_holidays.components.Composer.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('im_livechat', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Composer', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('livechat: no add attachment button', async function (assert) {
    // Attachments are not yet supported in livechat, especially from livechat
    // visitor PoV. This may likely change in the future with task-2029065.
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/create',
        {
            channelType: 'livechat',
            id: 10,
            model: 'mail.channel',
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'Composer',
        { composer: thread.composer() },
    );
    assert.containsOnce(
        document.body,
        '.o-Composer',
        "should have a composer",
    );
    assert.containsNone(
        document.body,
        '.o-Composer-buttonAttachment',
        "composer linked to livechat should not have a 'Add attachment' button",
    );
});

});
});
});
