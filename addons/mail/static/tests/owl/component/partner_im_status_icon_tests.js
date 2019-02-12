odoo.define('mail.component.PartnerImStatusIconTests', function (require) {
"use strict";

const PartnerImStatusIcon = require('mail.component.PartnerImStatusIcon');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    createStore,
    pause,
} = require('mail.owl.test_utils');

const testUtils = require('web.test_utils');

QUnit.module('mail.owl', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('PartnerImStatusIcon', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createPartnerImStatusIcon = async partnerLocalId => {
            const env = await this.widget.call('env', 'get');
            this.partnerImStatusIcon = new PartnerImStatusIcon(env, {
                partnerLocalId,
            });
            await this.partnerImStatusIcon.mount(this.widget.$el[0]);
        };
        this.createStore = async params => {
            if (this.wiget) {
                this.widget.destroy();
            }
            let { store, widget } = await createStore({
                ...params,
                data: this.data,
            });
            this.store = store;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.partnerImStatusIcon) {
            this.partnerImStatusIcon.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.store = undefined;
    }
});

QUnit.test('initially online', async function (assert) {
    assert.expect(3);

    await this.createStore();

    const partnerLocalId = this.store.commit('createPartner', {
        id: 7,
        name: "Demo User",
        im_status: 'online',
    });

    await this.createPartnerImStatusIcon(partnerLocalId);

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon`)
            .length,
        1,
        "should have partner IM status icon");
    assert.strictEqual(
        document
            .querySelector(`.o_PartnerImStatusIcon`)
            .dataset
            .partnerLocalId,
        'res.partner_7',
        "partner IM status icon should be linked to partner with ID 7");

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_online`)
            .length,
        1,
        "partner IM status icon should have online status rendering");
});

QUnit.test('initially offline', async function (assert) {
    assert.expect(1);

    await this.createStore();

    const partnerLocalId = this.store.commit('createPartner', {
        id: 7,
        name: "Demo User",
        im_status: 'offline',
    });

    await this.createPartnerImStatusIcon(partnerLocalId);

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_offline`)
            .length,
        1,
        "partner IM status icon should have offline status rendering");
});

QUnit.test('initially away', async function (assert) {
    assert.expect(1);

    await this.createStore();

    const partnerLocalId = this.store.commit('createPartner', {
        id: 7,
        name: "Demo User",
        im_status: 'away',
    });

    await this.createPartnerImStatusIcon(partnerLocalId);

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_away`)
            .length,
        1,
        "partner IM status icon should have away status rendering");
});

QUnit.test('change icon on change partner im_status', async function (assert) {
    assert.expect(4);

    await this.createStore();

    const partnerLocalId = this.store.commit('createPartner', {
        id: 7,
        name: "Demo User",
        im_status: 'online',
    });

    await this.createPartnerImStatusIcon(partnerLocalId);

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_online`)
            .length,
        1,
        "partner IM status icon should have online status rendering");

    this.store.commit('updatePartner', 'res.partner_7', {
        im_status: 'offline',
    });
    await testUtils.nextTick(); // re-rendering

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_offline`)
            .length,
        1,
        "partner IM status icon should have offline status rendering");

    this.store.commit('updatePartner', 'res.partner_7', {
        im_status: 'away',
    });
    await testUtils.nextTick(); // re-rendering

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_away`)
            .length,
        1,
        "partner IM status icon should have away status rendering");

    this.store.commit('updatePartner', 'res.partner_7', {
        im_status: 'online',
    });
    await testUtils.nextTick(); // re-rendering

    assert.strictEqual(
        document
            .querySelectorAll(`.o_PartnerImStatusIcon_online`)
            .length,
        1,
        "partner IM status icon should have online status rendering in the end");
});

});
});
});
