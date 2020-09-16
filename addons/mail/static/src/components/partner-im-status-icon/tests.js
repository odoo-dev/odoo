/** @odoo-module alias=mail.components.PartnerImStatusIcon.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
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

QUnit.test('initially online', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch('Partner/create', {
        $$$id: 7,
        $$$name: "Demo User",
        $$$im_status: 'online',
    });
    await env.services.action.dispatch('Component/mount', 'PartnerImStatus', { partner });
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon',
        "should have partner IM status icon",
    );
    assert.strictEqual(
        document.querySelector('.o-PartnerImStatusIcon').dataset.partnerLocalId,
        partner.localId,
        "partner IM status icon should be linked to partner with ID 7",
    );
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isOnline',
        "partner IM status icon should have online status rendering",
    );
});

QUnit.test('initially offline', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch('Partner/create', {
        $$$id: 7,
        $$$name: "Demo User",
        $$$im_status: 'offline',
    });
    await env.services.action.dispatch('Component/mount', 'PartnerImStatus', { partner });
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isOffline',
        "partner IM status icon should have offline status rendering",
    );
});

QUnit.test('initially away', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch('Partner/create', {
        $$$id: 7,
        $$$name: "Demo User",
        $$$im_status: 'away',
    });
    await env.services.action.dispatch('Component/mount', 'PartnerImStatus', { partner });
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isAway',
        "partner IM status icon should have away status rendering",
    );
});

QUnit.test('change icon on change partner im_status', async function (assert) {
    assert.expect(4);

    createServer(this.data);
    const env = await createEnv();
    const partner = env.services.action.dispatch('Partner/create', {
        $$$id: 7,
        $$$name: "Demo User",
        $$$im_status: 'online',
    });
    await env.services.action.dispatch('Component/mount', 'PartnerImStatus', { partner });
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isOnline',
        "partner IM status icon should have online status rendering",
    );

    await afterNextRender(
        () => env.services.action.dispatch('Record/update', partner, {
            $$$im_status: 'offline',
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isOffline',
        "partner IM status icon should have offline status rendering",
    );

    await afterNextRender(
        () => env.services.action.dispatch('Record/update', partner, {
            $$$im_status: 'away',
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isAway',
        "partner IM status icon should have away status rendering",
    );

    await afterNextRender(
        () => env.services.action.dispatch('Record/update', partner, {
            $$$im_status: 'online',
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-PartnerImStatusIcon.o-isOnline',
        "partner IM status icon should have online status rendering in the end",
    );
});

});
});
});
