/** @odoo-module alias=hr_holidays.components.PartnerImStatusIcon.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('hr_holidays', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('PartnerImStatusIcon', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('on leave & online', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch(
        'Partner/create',
        {
            id: 7,
            imStatus: 'leave_online',
            name: "Demo User",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'PartnerImStatusIcon',
        { partner },
    );
    assert.hasClass(
        document.querySelector('.o-PartnerImStatusIcon-icon'),
        'o-isOnline',
        "partner IM status icon should have online status rendering",
    );
    assert.hasClass(
        document.querySelector('.o-PartnerImStatusIcon-icon'),
        'fa-plane',
        "partner IM status icon should have leave status rendering",
    );
});

QUnit.test('on leave & away', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch(
        'Partner/create',
        {
            id: 7,
            imStatus: 'leave_away',
            name: "Demo User",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'PartnerImStatusIcon',
        { partner },
    );
    assert.hasClass(
        document.querySelector('.o-PartnerImStatusIcon-icon'),
        'o-isAway',
        "partner IM status icon should have away status rendering",
    );
    assert.hasClass(
        document.querySelector('.o-PartnerImStatusIcon-icon'),
        'fa-plane',
        "partner IM status icon should have leave status rendering",
    );
});

QUnit.test('on leave & offline', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch(
        'Partner/create',
        {
            id: 7,
            imStatus: 'leave_offline',
            name: "Demo User",
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'PartnerImStatusIcon',
        { partner },
    );
    assert.hasClass(
        document.querySelector('.o-PartnerImStatusIcon-icon'),
        'o-isOffline',
        "partner IM status icon should have offline status rendering",
    );
    assert.hasClass(
        document.querySelector('.o-PartnerImStatusIcon-icon'),
        'fa-plane',
        "partner IM status icon should have leave status rendering",
    );
});

});
});
});
