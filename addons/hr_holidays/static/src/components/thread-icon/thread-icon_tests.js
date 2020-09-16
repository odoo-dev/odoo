/** @odoo-module alias=hr_holidays.components.ThreadIcon.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ThreadIcon', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('thread icon of a chat when correspondent is on leave & online', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 20,
            members: [this.data.currentPartnerId, 7],
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 7,
            im_status: 'leave_online',
            name: 'Demo',
        },
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
    await env.services.action.dispatch(
        'Component/mount',
        'ThreadIcon',
        { thread },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-online',
        "thread icon should have online status rendering",
    );
    assert.hasClass(
        document.querySelector('.o-ThreadIcon-online'),
        'fa-plane',
        "thread icon should have leave status rendering",
    );
});

QUnit.test('thread icon of a chat when correspondent is on leave & away', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 20,
            members: [this.data.currentPartnerId, 7],
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 7,
            im_status: 'leave_away',
            name: 'Demo',
        },
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
    await env.services.action.dispatch(
        'Component/mount',
        'ThreadIcon',
        { thread },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-away',
        "thread icon should have away status rendering",
    );
    assert.hasClass(
        document.querySelector('.o-ThreadIcon-away'),
        'fa-plane',
        "thread icon should have leave status rendering",
    );
});

QUnit.test('thread icon of a chat when correspondent is on leave & offline', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 20,
            members: [this.data.currentPartnerId, 7],
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 7,
            im_status: 'leave_offline',
            name: 'Demo',
        },
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
    await env.services.action.dispatch(
        'Component/mount',
        'ThreadIcon',
        { thread },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadIcon-offline',
        "thread icon should have offline status rendering",
    );
    assert.hasClass(
        document.querySelector('.o-ThreadIcon-offline'),
        'fa-plane',
        "thread icon should have leave status rendering",
    );
});

});
});
});
