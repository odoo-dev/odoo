/** @odoo-module alias=website_livechat.components.Discuss.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('website_livechat', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Discuss', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('rendering of visitor banner', async function (assert) {
    assert.expect(13);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'livechat',
            id: 11,
            livechat_operator_id: this.data.currentPartnerId,
            livechat_visitor_id: 11,
            members: [this.data.currentPartnerId, this.data.publicPartnerId],
        },
    );
    this.data['res.country'].records.push(
        {
            code: 'FAKE',
            id: 11,
        },
    );
    this.data['website.visitor'].records.push(
        {
            country_id: 11,
            display_name: 'Visitor #11',
            history: 'Home → Contact',
            id: 11,
            is_connected: true,
            lang_name: "English",
            website_name: "General website",
        },
    );
    createServer(this.data);
    const env = await this.createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch(
            'Thread/findById',
            {
                $$$id: 11,
                $$$model: 'mail.channel',
            },
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner',
        "should have a visitor banner",
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner-avatar',
        "should show the visitor avatar in the banner",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-avatar').dataset.src,
        "/mail/static/src/img/smiley/avatar.jpg",
        "should show the default avatar",
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner-onlineStatusIcon',
        "should show the visitor online status icon on the avatar",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-country').dataset.src,
        "/base/static/img/country_flags/FAKE.png",
        "should show the flag of the country of the visitor",
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner-visitor',
        "should show the visitor name in the banner",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-visitor').textContent,
        "Visitor #11",
        "should have 'Visitor #11' as visitor name",
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner-language',
        "should show the visitor language in the banner",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-language').textContent,
        "English",
        "should have 'English' as language of the visitor",
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner-website',
        "should show the visitor website in the banner",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-website').textContent,
        "General website",
        "should have 'General website' as website of the visitor",
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner-history',
        "should show the visitor history in the banner",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-history').textContent,
        "Home → Contact",
        "should have 'Home → Contact' as history of the visitor",
    );
});

QUnit.test('livechat with non-logged visitor should show visitor banner', async function (assert) {
    assert.expect(1);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'livechat',
            id: 11,
            livechat_operator_id: this.data.currentPartnerId,
            livechat_visitor_id: 11,
            members: [this.data.currentPartnerId, this.data.publicPartnerId],
        },
    );
    this.data['res.country'].records.push(
        {
            id: 11,
            code: 'FAKE',
        },
    );
    this.data['website.visitor'].records.push(
        {
            id: 11,
            country_id: 11,
            display_name: 'Visitor #11',
            history: 'Home → Contact',
            is_connected: true,
            lang_name: "English",
            website_name: "General website",
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch(
            'Thread/findById',
            {
                $$$id: 11,
                $$$model: 'mail.channel',
            },
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner',
        "should have a visitor banner",
    );
});

QUnit.test('livechat with logged visitor should show visitor banner', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'livechat',
            id: 11,
            livechat_operator_id: this.data.currentPartnerId,
            livechat_visitor_id: 11,
            members: [this.data.currentPartnerId, 12],
        },
    );
    this.data['res.country'].records.push(
        {
            id: 11,
            code: 'FAKE',
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 12,
            name: 'Partner Visitor',
        },
    );
    this.data['website.visitor'].records.push(
        {
            id: 11,
            country_id: 11,
            display_name: 'Visitor #11',
            history: 'Home → Contact',
            is_connected: true,
            lang_name: "English",
            partner_id: 12,
            website_name: "General website",
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch(
            'Thread/findById',
            {
                $$$id: 11,
                $$$model: 'mail.channel',
            },
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-VisitorBanner',
        "should have a visitor banner",
    );
    assert.strictEqual(
        document.querySelector('.o-VisitorBanner-visitor').textContent,
        "Partner Visitor",
        "should have partner name as display name of logged visitor on the visitor banner",
    );
});

QUnit.test('livechat without visitor should not show visitor banner', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'livechat',
            id: 11,
            livechat_operator_id: this.data.currentPartnerId,
            members: [this.data.currentPartnerId, 11],
        },
    );
    this.data['res.partner'].records.push(
        { id: 11 },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch(
            'Thread/findById',
            {
                $$$id: 11,
                $$$model: 'mail.channel',
            },
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-MessageList',
        "should have a message list",
    );
    assert.containsNone(
        document.body,
        '.o-VisitorBanner',
        "should not have any visitor banner",
    );
});

QUnit.test('non-livechat channel should not show visitor banner', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push(
        {
            id: 11,
            name: "General",
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch(
        'Component/mount',
        'Discuss',
    );
    await env.services.action.dispatch(
        'Thread/open',
        env.services.action.dispatch(
            'Thread/findById',
            {
                $$$id: 11,
                $$$model: 'mail.channel',
            },
        ),
    );
    assert.containsOnce(
        document.body,
        '.o-MessageList',
        "should have a message list",
    );
    assert.containsNone(
        document.body,
        '.o-VisitorBanner',
        "should not have any visitor banner",
    );
});

});
});
});
