/** @odoo-module **/

import {
    start,
    startServer,
} from '@mail/../tests/helpers/test_utils';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('discuss', {}, function () {
QUnit.module('discuss_member_list_tests.js', {
    beforeEach() {
        this.start = async params => {
            return start(Object.assign({}, params, {
                autoOpenDiscuss: true,
                hasDiscuss: true,
            }));
        };
    },
});

QUnit.test('there should be a button to show member list in the thread view topbar initially', async function (assert) {
    assert.expect(1);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv['res.partner'].create({ name: "Demo" });
    const mailChannelId1 = pyEnv['mail.channel'].create({
        channel_last_seen_partner_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: 'group',
        public: 'private',
    });
    await this.start({
        discuss: {
            context: {
                active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_ThreadViewTopbar_showMemberListButton',
        "there should be a button to show member list in the thread view topbar initially",
    );
});

QUnit.test('should show member list when clicking on show member list button in thread view topbar', async function (assert) {
    assert.expect(1);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv['res.partner'].create({ name: "Demo" });
    const mailChannelId1 = pyEnv['mail.channel'].create({
        channel_last_seen_partner_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: 'group',
        public: 'private',
    });
    const { click } = await this.start({
        discuss: {
            context: {
                active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await click('.o_ThreadViewTopbar_showMemberListButton');
    assert.containsOnce(
        document.body,
        '.o_ChannelMemberList',
        "should show member list when clicking on show member list button in thread view topbar",
    );
});

QUnit.test('should have correct members in member list', async function (assert) {
    assert.expect(3);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv['res.partner'].create({ name: "Demo" });
    const mailChannelId1 = pyEnv['mail.channel'].create({
        channel_last_seen_partner_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: 'group',
        public: 'private',
    });
    const { click, messaging } = await this.start({
        discuss: {
            context: {
                active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await click('.o_ThreadViewTopbar_showMemberListButton');

    assert.containsN(
        document.body,
        '.o_ChannelMember',
        2,
        "should have 2 members in member list",
    );
    const channel = messaging.models['Channel'].findFromIdentifyingData({ id: mailChannelId1 });
    const partner = messaging.models['Partner'].findFromIdentifyingData({ id: resPartnerId1 });
    const currentPartner = messaging.models['Partner'].findFromIdentifyingData({ id: pyEnv.currentPartnerId });
    assert.containsOnce(
        document.body,
        `.o_ChannelMember[data-partner-local-id="${
            messaging.models['ChannelPartner'].findFromIdentifyingData({ partner, channel }).localId
        }"]`,
        "should have current partner in member list (current partner is a member)",
    );
    assert.containsOnce(
        document.body,
        `.o_ChannelMember[data-partner-local-id="${
            messaging.models['ChannelPartner'].findFromIdentifyingData({ channel, partner: currentPartner }).localId
        }"]`,
        "should have 'Demo' in member list ('Demo' is a member)",
    );
});

QUnit.test('there should be a button to hide member list in the thread view topbar when the member list is visible', async function (assert) {
    assert.expect(1);

    const pyEnv = await startServer();
    const resPartnerId1 = pyEnv['res.partner'].create({ name: "Demo" });
    const mailChannelId1 = pyEnv['mail.channel'].create({
        channel_last_seen_partner_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            [0, 0, { partner_id: resPartnerId1 }],
        ],
        channel_type: 'group',
        public: 'private',
    });
    const { click } = await this.start({
        discuss: {
            context: {
                active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await click('.o_ThreadViewTopbar_showMemberListButton');
    assert.containsOnce(
        document.body,
        '.o_ThreadViewTopbar_hideMemberListButton',
        "there should be a button to hide member list in the thread view topbar when the member list is visible",
    );
});

QUnit.test('Channel member list should initially show only 30 first members.', async function (assert) {
    assert.expect(1);

    const pyEnv = await startServer();
    const partners = [];
    for (let i = 0; i < 60; i++) {
        partners.push(pyEnv['res.partner'].create({
            name: 'name_' + i,
            im_status: 'online'
        }));
    }
    const mailChannelId1 = pyEnv['mail.channel'].create({});
    for (const partnerId of partners) {
        pyEnv['mail.channel.partner'].create({
            partner_id: partnerId,
            channel_id: mailChannelId1,
        });
    }
    const { click } = await this.start({
        discuss: {
            context: {
                active_id: `mail.channel_${mailChannelId1}`,
            },
        },
    });
    await click('.o_ThreadViewTopbar_showMemberListButton');

    assert.strictEqual(
        document.querySelectorAll('.o_ChannelMember').length,
        30,
        "Channel member list should contain only the first 30 members."
    );
});

});
});
});
